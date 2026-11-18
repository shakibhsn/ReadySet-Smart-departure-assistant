import { DateTime } from 'luxon'
import { prisma } from '../config/database.js'
import { AppError } from '../utils/apiResponse.js'
import { DEFAULT_TIMEZONE, isDateString, localParts, parseStart, startOfLocalDay, toZone } from '../utils/timezone.js'
import { expandOccurrences } from './recurrence.service.js'

// SECURITY (IDOR): every query below filters by `userId`, which always comes from the verified JWT
// (req.userId). An event id alone is never enough to read, change or delete a row.

const withRule = { recurrenceRule: true }
const MAX_RANGE_DAYS = 93
const UPCOMING_HORIZON_DAYS = 90
const notFound = () => new AppError(404, 'Event not found')
const fieldError = (field, message) => new AppError(400, 'Validation failed', [{ field, message }])

// ---------- presentation ----------

const toPublicRecurrence = (rule, timezone) =>
  rule
    ? {
        frequency: rule.frequency,
        interval: rule.interval,
        daysOfWeek: rule.daysOfWeek,
        endsOn: rule.endsAt ? toZone(rule.endsAt, timezone).toFormat('yyyy-MM-dd') : null,
      }
    : null

/** Public shape. userId and the rule's internal id are never exposed. */
export function toPublicEvent(event, occurrenceStart = null) {
  const start = occurrenceStart ?? event.startAt
  return {
    id: event.id,
    title: event.title,
    category: event.category,
    startAt: start.toISOString(),
    timezone: event.timezone,
    ...localParts(start, event.timezone), // localDate / localTime in the EVENT's timezone
    destination: event.destination,
    notes: event.notes,
    travelDurationMinutes: event.travelDurationMinutes,
    preparationMinutes: event.preparationMinutes,
    arrivalBufferMinutes: event.arrivalBufferMinutes,
    isRecurring: event.isRecurring,
    recurrence: toPublicRecurrence(event.recurrenceRule, event.timezone),
    seriesStartAt: event.startAt.toISOString(),
    isOccurrence: occurrenceStart !== null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  }
}

const seriesOf = (event) => ({ startAt: event.startAt, timezone: event.timezone, rule: event.recurrenceRule })

// ---------- helpers ----------

async function getUserTimezone(userId) {
  const pref = await prisma.userPreference.findUnique({ where: { userId }, select: { timezone: true } })
  return pref?.timezone ?? DEFAULT_TIMEZONE
}

function resolveStart(input, timezone) {
  const start = parseStart(input, timezone)
  if (!start) throw fieldError('startAt', 'Not a valid date and time')
  return start
}

/** Builds the rule columns from client input, validating it against the event's start. */
function buildRuleData(rec, start, timezone) {
  const interval = rec.interval ?? 1
  let daysOfWeek = []
  if (rec.frequency === 'WEEKLY') {
    daysOfWeek = [...new Set(rec.daysOfWeek ?? [start.weekday])].sort((a, b) => a - b)
    if (!daysOfWeek.includes(start.weekday)) {
      throw fieldError('recurrence.daysOfWeek', 'The event start date must fall on one of the selected weekdays')
    }
  }
  let endsAt = null
  if (rec.endsOn) {
    const endDay = startOfLocalDay(rec.endsOn, timezone)
    if (!endDay) throw fieldError('recurrence.endsOn', 'Not a valid date')
    if (rec.endsOn < start.toFormat('yyyy-MM-dd')) throw fieldError('recurrence.endsOn', 'End date cannot be before the event start date')
    endsAt = endDay.endOf('day').toJSDate()
  }
  return { frequency: rec.frequency, interval, daysOfWeek, endsAt }
}

function parseBound(value, timezone, edge, field) {
  if (isDateString(value)) {
    const day = startOfLocalDay(value, timezone)
    if (!day) throw fieldError(field, 'Not a valid date')
    return (edge === 'end' ? day.endOf('day') : day).toJSDate()
  }
  const dt = DateTime.fromISO(value, { setZone: true })
  if (!dt.isValid) throw fieldError(field, 'Not a valid date')
  return dt.toJSDate()
}

async function resolveRange({ from, to, timezone }, userId) {
  const tz = timezone ?? (await getUserTimezone(userId))
  const gte = from ? parseBound(from, tz, 'start', 'from') : undefined
  const lte = to ? parseBound(to, tz, 'end', 'to') : undefined
  if (gte && lte && gte > lte) throw fieldError('to', '"to" cannot be before "from"')
  return { gte, lte }
}

// ---------- operations ----------

export async function createEvent(userId, input) {
  const timezone = input.timezone ?? (await getUserTimezone(userId))
  const start = resolveStart(input.startAt, timezone)
  const rule = input.recurrence ? buildRuleData(input.recurrence, start, timezone) : null

  // Rule and event are saved together: both succeed or neither does.
  return prisma.$transaction(async (tx) => {
    const created = rule ? await tx.recurrenceRule.create({ data: { ...rule, userId } }) : null
    const event = await tx.event.create({
      data: {
        userId,
        title: input.title,
        category: input.category,
        startAt: start.toJSDate(),
        timezone,
        destination: input.destination ?? null,
        notes: input.notes ?? null,
        travelDurationMinutes: input.travelDurationMinutes,
        preparationMinutes: input.preparationMinutes,
        arrivalBufferMinutes: input.arrivalBufferMinutes,
        isRecurring: Boolean(created),
        recurrenceRuleId: created?.id ?? null,
      },
      include: withRule,
    })
    return toPublicEvent(event)
  })
}

export async function listEvents(userId, query) {
  const { gte, lte } = await resolveRange(query, userId)
  const where = {
    userId,
    ...(query.category && { category: query.category }),
    ...((gte || lte) && { startAt: { ...(gte && { gte }), ...(lte && { lte }) } }),
  }
  const field = query.sort.replace('-', '')
  const direction = query.sort.startsWith('-') ? 'desc' : 'asc'

  const [total, rows] = await prisma.$transaction([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      include: withRule,
      orderBy: [{ [field]: direction }, { id: 'asc' }], // id makes the order stable for equal values
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ])

  return {
    events: rows.map((e) => toPublicEvent(e)),
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  }
}

export async function getEvent(userId, id) {
  const event = await prisma.event.findFirst({ where: { id, userId }, include: withRule })
  if (!event) throw notFound() // same response whether it does not exist or belongs to someone else
  return toPublicEvent(event)
}

export async function updateEvent(userId, id, input) {
  const existing = await prisma.event.findFirst({ where: { id, userId }, include: withRule })
  if (!existing) throw notFound()

  const timezone = input.timezone ?? existing.timezone
  let start = toZone(existing.startAt, existing.timezone)
  const timeChanged = input.startAt !== undefined || timezone !== existing.timezone
  if (input.startAt !== undefined) {
    start = resolveStart(input.startAt, timezone)
  } else if (timezone !== existing.timezone) {
    // Zone changed without a new time: keep the same LOCAL wall time, re-read in the new zone.
    start = resolveStart(start.toFormat("yyyy-MM-dd'T'HH:mm:ss"), timezone)
  }

  // Work out the recurrence outcome: undefined = keep, null = remove, object = new rule data.
  let ruleChange
  if (input.recurrence === null) ruleChange = null
  else if (input.recurrence) ruleChange = buildRuleData(input.recurrence, start, timezone)
  else if (existing.recurrenceRule && timeChanged) {
    // Rule untouched but the start moved: re-validate it against the new start (same local end day).
    const old = existing.recurrenceRule
    const endsOn = old.endsAt ? toZone(old.endsAt, existing.timezone).toFormat('yyyy-MM-dd') : null
    ruleChange = buildRuleData({ frequency: old.frequency, interval: old.interval, daysOfWeek: old.daysOfWeek.length ? old.daysOfWeek : undefined, endsOn }, start, timezone)
  }

  const data = {}
  for (const key of ['title', 'category', 'destination', 'notes', 'travelDurationMinutes', 'preparationMinutes', 'arrivalBufferMinutes']) {
    if (input[key] !== undefined) data[key] = input[key]
  }
  if (timeChanged) {
    data.startAt = start.toJSDate()
    data.timezone = timezone
  }

  return prisma.$transaction(async (tx) => {
    const ruleId = existing.recurrenceRuleId
    if (ruleChange === null && ruleId) {
      await tx.event.update({ where: { id, userId }, data: { recurrenceRuleId: null, isRecurring: false } })
      await tx.recurrenceRule.deleteMany({ where: { id: ruleId, userId } })
    } else if (ruleChange && ruleId) {
      await tx.recurrenceRule.update({ where: { id: ruleId, userId }, data: ruleChange })
    } else if (ruleChange) {
      const created = await tx.recurrenceRule.create({ data: { ...ruleChange, userId } })
      data.recurrenceRuleId = created.id
      data.isRecurring = true
    }
    const updated = await tx.event.update({ where: { id, userId }, data, include: withRule })
    return toPublicEvent(updated)
  })
}

export async function deleteEvent(userId, id) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.event.findFirst({ where: { id, userId }, select: { recurrenceRuleId: true } })
    if (!existing) throw notFound()
    await tx.event.deleteMany({ where: { id, userId } })
    // The rule belongs to this event only, so it is removed with it (no orphan rules).
    if (existing.recurrenceRuleId) await tx.recurrenceRule.deleteMany({ where: { id: existing.recurrenceRuleId, userId } })
  })
}

/** Upcoming occurrences (not just base events), earliest first. Past events are excluded. */
export async function getUpcoming(userId, { limit }) {
  const now = new Date()
  const horizon = new Date(now.getTime() + UPCOMING_HORIZON_DAYS * 86_400_000)

  const [single, recurring] = await Promise.all([
    prisma.event.findMany({
      where: { userId, recurrenceRuleId: null, startAt: { gte: now } },
      include: withRule,
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      take: limit,
    }),
    prisma.event.findMany({
      where: {
        userId,
        recurrenceRuleId: { not: null },
        startAt: { lte: horizon },
        recurrenceRule: { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      },
      include: withRule,
      take: 200,
    }),
  ])

  const items = single.map((e) => ({ event: e, at: e.startAt }))
  for (const e of recurring) {
    for (const at of expandOccurrences(seriesOf(e), now, horizon, { max: limit })) items.push({ event: e, at })
  }
  items.sort((a, b) => a.at - b.at || a.event.id.localeCompare(b.event.id))
  return { events: items.slice(0, limit).map(({ event, at }) => toPublicEvent(event, event.isRecurring ? at : null)) }
}

/**
 * Raw occurrences (event row + exact start instant) of one user's events inside [from, to], recurring
 * series expanded, single events included, sorted by start. Shared by the occurrences endpoint and
 * the departure-plan service, so recurrence expansion exists in exactly one place.
 * Scoped by userId like every other query in this file.
 */
export async function listOccurrenceRecords(userId, from, to, { category } = {}) {
  const categoryFilter = category ? { category } : {}
  const [single, recurring] = await Promise.all([
    prisma.event.findMany({ where: { userId, ...categoryFilter, recurrenceRuleId: null, startAt: { gte: from, lte: to } }, include: withRule, take: 500 }),
    prisma.event.findMany({
      where: {
        userId,
        ...categoryFilter,
        recurrenceRuleId: { not: null },
        startAt: { lte: to },
        recurrenceRule: { OR: [{ endsAt: null }, { endsAt: { gte: from } }] },
      },
      include: withRule,
      take: 200,
    }),
  ])

  const items = single.map((event) => ({ event, at: event.startAt }))
  for (const event of recurring) {
    for (const at of expandOccurrences(seriesOf(event), from, to)) items.push({ event, at })
  }
  items.sort((a, b) => a.at - b.at || a.event.id.localeCompare(b.event.id))
  return items
}

/** All occurrences of the user's events inside [from, to], recurring series expanded. */
export async function getOccurrences(userId, query) {
  const { gte, lte } = await resolveRange(query, userId)
  if ((lte - gte) / 86_400_000 > MAX_RANGE_DAYS) throw fieldError('to', `Range cannot exceed ${MAX_RANGE_DAYS} days`)
  const items = await listOccurrenceRecords(userId, gte, lte, { category: query.category })
  return { events: items.map(({ event, at }) => toPublicEvent(event, event.isRecurring ? at : null)) }
}

/** Single owned event row (with its recurrence rule) or a 404. Used by the departure-plan service. */
export async function findOwnedEvent(userId, id) {
  const event = await prisma.event.findFirst({ where: { id, userId }, include: withRule })
  if (!event) throw notFound()
  return event
}

export { seriesOf }
