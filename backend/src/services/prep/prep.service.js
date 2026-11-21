import { prisma } from '../../config/database.js'
import { AppError } from '../../utils/apiResponse.js'
import { calculateDeparturePlan, resolveTimezone } from '../departure/departureCalculator.js'
import { findOccurrence, occurrencesOf } from '../occurrence.js'
import { actualPrepMinutes, applyAction, buildProfile, latenessMinutes, WINDOW_DAYS } from './prepRules.js'

// Preparation logging + the profile. SECURITY/PRIVACY: every query filters by userId from the verified JWT; timestamps
// are always written by the server (the client only says WHICH action); only the user's own prep times, departure
// punctuality and own checklist item names are stored. Nothing is inferred from checklist activity.

export const WINDOW_BEFORE_MIN = 60 // logging opens this long before preparation is planned to start
export const WINDOW_AFTER_MIN = 120 // and closes this long after the event starts
const MIN = 60_000
const MAX_LOGS = 500
const MAX_UNCHECKED = 20
const notFound = (what) => new AppError(404, `${what} not found`)

const iso = (d) => d?.toISOString() ?? null

export const toPublicLog = (l) => ({
  id: l.id, eventId: l.eventId, category: l.category, occurrenceStart: iso(l.occurrenceStart),
  plannedPrepMinutes: l.plannedPrepMinutes, plannedDepartureAt: iso(l.plannedDepartureAt),
  prepStartedAt: iso(l.prepStartedAt), readyAt: iso(l.readyAt), cancelledAt: iso(l.cancelledAt), leftAt: iso(l.leftAt),
  actualPrepMinutes: actualPrepMinutes(l), latenessMinutes: latenessMinutes(l),
  uncheckedItems: Array.isArray(l.uncheckedItems) ? l.uncheckedItems : [],
  createdAt: iso(l.createdAt),
})

async function prefsOf(userId) {
  const p = await prisma.userPreference.findUnique({ where: { userId }, select: { adaptiveProfileEnabled: true, preparationOverrides: true, defaultArrivalBufferMinutes: true } })
  if (!p) throw new AppError(404, 'Preferences not found')
  return p
}

async function ownEvent(userId, eventId) {
  const e = await prisma.event.findFirst({ where: { id: eventId, userId }, include: { recurrenceRule: true, exceptions: true } })
  if (!e) throw notFound('Event')
  return e
}

/** Plan facts for one occurrence (merged event, so an edited occurrence uses its own times). */
function windowOf(occ) {
  const plan = calculateDeparturePlan({
    startAt: occ.at, timezone: resolveTimezone(occ.event.timezone),
    travelDurationMinutes: occ.event.travelDurationMinutes, preparationMinutes: occ.event.preparationMinutes, arrivalBufferMinutes: occ.event.arrivalBufferMinutes,
  })
  return { plan, opensAt: new Date(plan.preparationStart.getTime() - WINDOW_BEFORE_MIN * MIN), closesAt: new Date(occ.at.getTime() + WINDOW_AFTER_MIN * MIN) }
}

/** The occurrence being logged: the requested one, or the one whose logging window contains `now`. */
function pickOccurrence(event, occurrence, now) {
  if (occurrence) {
    const found = findOccurrence(event, new Date(occurrence))
    if (!found) throw new AppError(400, 'Validation failed', [{ field: 'occurrence', message: 'Not an occurrence of this event' }])
    return found
  }
  const candidates = occurrencesOf(event, new Date(now.getTime() - WINDOW_AFTER_MIN * MIN), new Date(now.getTime() + 3 * 86_400_000))
  return candidates.find((o) => { const w = windowOf(o); return now >= w.opensAt && now <= w.closesAt }) ?? candidates[0] ?? null
}

export async function getCurrentLog(userId, eventId, occurrence, now = new Date()) {
  const [event, prefs] = await Promise.all([ownEvent(userId, eventId), prefsOf(userId)])
  const occ = pickOccurrence(event, occurrence, now)
  if (!occ) return { enabled: prefs.adaptiveProfileEnabled, log: null, occurrenceStart: null, window: null }
  const w = windowOf(occ)
  const log = await prisma.preparationLog.findFirst({ where: { userId, eventId, occurrenceStart: occ.originalStart } })
  return { enabled: prefs.adaptiveProfileEnabled, log: log ? toPublicLog(log) : null, occurrenceStart: occ.originalStart.toISOString(), window: { opensAt: w.opensAt.toISOString(), closesAt: w.closesAt.toISOString(), open: now >= w.opensAt && now <= w.closesAt } }
}

export async function recordAction(userId, eventId, { action, occurrence }, now = new Date()) {
  const [event, prefs] = await Promise.all([ownEvent(userId, eventId), prefsOf(userId)])
  if (!prefs.adaptiveProfileEnabled) throw new AppError(409, 'The preparation profile is turned off. Turn it on in the Preparation Profile page to log activity.')
  const occ = pickOccurrence(event, occurrence, now)
  if (!occ) throw new AppError(409, 'This event has no upcoming occurrence to log.')
  const w = windowOf(occ)
  if (now < w.opensAt || now > w.closesAt) throw new AppError(409, 'Activity can only be logged from 1 hour before preparation starts until 2 hours after the event starts.')

  const where = { userId, eventId, occurrenceStart: occ.originalStart }
  const existing = await prisma.preparationLog.findFirst({ where })
  const result = applyAction(existing, action, now)
  if (result.error) throw new AppError(409, result.error)

  let patch = result.patch
  if (action === 'left' && result.changed) {
    // Names of MY checklist items still unchecked right now (labelled "unchecked when you left", never "forgotten").
    const unchecked = await prisma.checklistItem.findMany({ where: { userId, eventId, done: false }, orderBy: [{ position: 'asc' }, { id: 'asc' }], take: MAX_UNCHECKED, select: { text: true } })
    patch = { ...patch, uncheckedItems: unchecked.map((i) => i.text.slice(0, 120)) }
  }
  if (!result.changed && existing) return { log: toPublicLog(existing), changed: false }

  // createMany + skipDuplicates makes two simultaneous first taps safe (the unique key (user, event, occurrence) wins).
  if (!existing) {
    await prisma.preparationLog.createMany({
      data: [{ ...where, category: occ.event.category, plannedPrepMinutes: occ.event.preparationMinutes, plannedDepartureAt: w.plan.departureTime, ...patch }],
      skipDuplicates: true,
    })
    const row = await prisma.preparationLog.findFirst({ where })
    return { log: toPublicLog(row), changed: true }
  }
  await prisma.preparationLog.updateMany({ where: { id: existing.id, userId }, data: patch })
  return { log: toPublicLog(await prisma.preparationLog.findFirst({ where: { id: existing.id, userId } })), changed: true }
}

export async function listLogs(userId, { limit = 30 } = {}) {
  const rows = await prisma.preparationLog.findMany({ where: { userId }, orderBy: [{ occurrenceStart: 'desc' }, { id: 'asc' }], take: limit })
  return { logs: rows.map(toPublicLog) }
}

export async function deleteLog(userId, id) {
  const r = await prisma.preparationLog.deleteMany({ where: { id, userId } })
  if (r.count === 0) throw notFound('Log')
}

/** Erase ALL of the user's preparation activity (user-initiated). */
export async function eraseAllLogs(userId) {
  return { deleted: (await prisma.preparationLog.deleteMany({ where: { userId } })).count }
}

// ---------------- profile, overrides, switch ----------------

const overridesOf = (prefs) => (prefs.preparationOverrides && typeof prefs.preparationOverrides === 'object' ? prefs.preparationOverrides : {})

export async function getProfile(userId, now = new Date()) {
  const prefs = await prefsOf(userId)
  const overrides = overridesOf(prefs)
  if (!prefs.adaptiveProfileEnabled) return { enabled: false, overrides, message: 'The preparation profile is turned off: nothing is logged or suggested.' }
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000)
  const logs = await prisma.preparationLog.findMany({ where: { userId, occurrenceStart: { gte: since } }, orderBy: { occurrenceStart: 'desc' }, take: MAX_LOGS })
  return {
    enabled: true,
    overrides,
    ...buildProfile({ logs, defaultBuffer: prefs.defaultArrivalBufferMinutes, now }),
    note: 'Suggestions are only suggestions: ReadySet never changes your events. Nothing is inferred from checklist activity.',
  }
}

export async function setEnabled(userId, enabled) {
  const r = await prisma.userPreference.updateMany({ where: { userId }, data: { adaptiveProfileEnabled: enabled } })
  if (r.count === 0) throw new AppError(404, 'Preferences not found')
  return { enabled }
}

export async function setOverride(userId, { category, prepMinutes, bufferMinutes }) {
  const prefs = await prefsOf(userId)
  const next = { ...overridesOf(prefs), [category]: { ...(prepMinutes !== undefined && { prepMinutes }), ...(bufferMinutes !== undefined && { bufferMinutes }) } }
  await prisma.userPreference.update({ where: { userId }, data: { preparationOverrides: next } })
  return { overrides: next }
}

export async function clearOverride(userId, category) {
  const prefs = await prefsOf(userId)
  const { [category]: _removed, ...rest } = overridesOf(prefs)
  await prisma.userPreference.update({ where: { userId }, data: { preparationOverrides: Object.keys(rest).length ? rest : null } })
  return { overrides: rest }
}
