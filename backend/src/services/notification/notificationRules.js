import { calculateDeparturePlan, resolveTimezone } from '../departure/departureCalculator.js'

// PURE (no database, no clock): which in-app notifications are due for ONE occurrence of an event.
// All times come from the departure calculator (the single source of truth); nothing is recalculated here.

export const MIN = 60_000
export const UPCOMING_LEAD_MINUTES = 60
export const GRACE_MINUTES = 30 // a reminder missed by more than this (e.g. server was down) is skipped, never sent late
export const LEAD_CHOICES = [5, 10, 15, 30]
export const REMINDER_TYPES = ['UPCOMING', 'PREP_SOON', 'PREP_NOW', 'DEPARTURE_SOON', 'DEPARTURE_NOW', 'CHECKLIST']

const clock = (date, timeZone) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(date).replace(/\s+/g, ' ')
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Idempotency key: the same event occurrence + kind always produces the same key. */
export const dedupeKeyFor = (eventId, start, kind) => `n:${eventId}:${start.toISOString()}:${kind}`

/**
 * @param event  { id, title, timezone, destination, travelDurationMinutes, preparationMinutes, arrivalBufferMinutes }
 * @param start  Date of THIS occurrence
 * @param prefs  { notificationsEnabled, notifyUpcoming, notifyPrep, notifyDeparture, notifyChecklist, notificationLeadMinutes }
 * @returns [{ kind, type, category, title, body, sendAt, dedupeKey }]
 */
export function dueNotifications({ event, start, prefs, pendingCount = 0, now = new Date() }) {
  if (!prefs?.notificationsEnabled || now >= start) return [] // never notify about an event that already started
  const plan = calculateDeparturePlan({
    startAt: start,
    timezone: resolveTimezone(event.timezone),
    travelDurationMinutes: event.travelDurationMinutes,
    preparationMinutes: event.preparationMinutes,
    arrivalBufferMinutes: event.arrivalBufferMinutes,
  })
  const lead = (prefs.notificationLeadMinutes ?? 10) * MIN
  const tz = event.timezone
  const at = (d) => clock(d, tz)
  const name = event.title
  const where = event.destination ? ` to ${event.destination}` : ''
  const leadText = plural(prefs.notificationLeadMinutes ?? 10, 'minute')

  // expiresAt: once the next milestone has arrived, the earlier "approaching" reminder is no longer useful.
  const candidates = []
  if (prefs.notifyUpcoming) {
    candidates.push({ kind: 'upcoming', type: 'UPCOMING', category: 'event', sendAt: new Date(start.getTime() - UPCOMING_LEAD_MINUTES * MIN), expiresAt: start, title: `${name} starts soon`, body: `Starts at ${at(start)}. Leave at ${at(plan.departureTime)}.` })
  }
  if (prefs.notifyPrep) {
    candidates.push(
      { kind: 'prep_soon', type: 'PREP_SOON', category: 'preparation', sendAt: new Date(plan.preparationStart.getTime() - lead), expiresAt: plan.preparationStart, title: 'Get ready soon', body: `${name}: start preparing in ${leadText} (at ${at(plan.preparationStart)}).` },
      { kind: 'prep_now', type: 'PREP_NOW', category: 'preparation', sendAt: plan.preparationStart, expiresAt: start, title: 'Time to start getting ready', body: `${name}: start preparing now. Leave at ${at(plan.departureTime)}.` },
    )
  }
  if (prefs.notifyDeparture) {
    candidates.push(
      { kind: 'departure_soon', type: 'DEPARTURE_SOON', category: 'departure', sendAt: new Date(plan.departureTime.getTime() - lead), expiresAt: plan.departureTime, title: `Leave in ${leadText}`, body: `${name}: leave at ${at(plan.departureTime)}${where} to arrive by ${at(plan.targetArrival)}.` },
      { kind: 'departure_now', type: 'DEPARTURE_NOW', category: 'departure', sendAt: plan.departureTime, expiresAt: start, title: 'Time to leave', body: `${name}: leave now${where} to arrive by ${at(plan.targetArrival)}.` },
    )
  }
  if (prefs.notifyChecklist && pendingCount > 0) {
    candidates.push({ kind: 'checklist', type: 'CHECKLIST', category: 'preparation', sendAt: new Date(plan.departureTime.getTime() - lead), expiresAt: plan.departureTime, title: 'Checklist incomplete', body: `${plural(pendingCount, 'item')} still pending for ${name}.` })
  }

  return candidates
    .filter((c) => c.sendAt <= now && now < c.expiresAt && now.getTime() - c.sendAt.getTime() <= GRACE_MINUTES * MIN)
    .map(({ expiresAt: _expiresAt, ...c }) => ({ ...c, dedupeKey: dedupeKeyFor(event.id, start, c.kind) }))
}
