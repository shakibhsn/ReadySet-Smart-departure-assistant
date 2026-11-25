import { DateTime } from 'luxon'
import { calculateDeparturePlan, resolveTimezone } from '../departure/departureCalculator.js'

// PURE (no database, no clock). Finds schedule conflicts between occurrences. It never changes anything: it only
// describes problems and SUGGESTS a later start. No traffic data is used: travel is each event's own saved estimate.
//
// Assumptions (reported to the user with every result):
//  - an event without a duration lasts DEFAULT_DURATION_MINUTES (flagged `assumedDuration`);
//  - an event's travel time is the time to get TO it from wherever you were before, so travel between two events is
//    only considered when BOTH have a destination and the destinations differ;
//  - preparation (getting ready) happens after the previous event ends, unless both events are at the same place.

export const DEFAULT_DURATION_MINUTES = 60
export const MAX_PAIRS = 5000
export const MAX_DAYS = 31
const MIN = 60_000
const roundUp5 = (ms) => Math.ceil(ms / (5 * MIN)) * 5 * MIN
const norm = (d) => (d ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const clock = (date, zone) => DateTime.fromJSDate(date, { zone }).toFormat('h:mm a')
const day = (date, zone) => DateTime.fromJSDate(date, { zone }).toFormat('yyyy-MM-dd')

/** @param occ { key, eventId, title, at: Date, event: { timezone, destination, durationMinutes, travelDurationMinutes, preparationMinutes, arrivalBufferMinutes } } */
export function toItem(occ) {
  const e = occ.event
  const zone = resolveTimezone(e.timezone)
  const duration = e.durationMinutes ?? DEFAULT_DURATION_MINUTES
  const plan = calculateDeparturePlan({ startAt: occ.at, timezone: zone, travelDurationMinutes: e.travelDurationMinutes, preparationMinutes: e.preparationMinutes, arrivalBufferMinutes: e.arrivalBufferMinutes })
  return {
    key: occ.key,
    eventId: occ.eventId,
    title: e.title,
    zone,
    start: occ.at,
    end: new Date(occ.at.getTime() + duration * MIN),
    assumedDuration: e.durationMinutes == null,
    destination: e.destination ?? null,
    priority: e.priority ?? 'normal', // low | normal | high: only used to order conflicts, never to hide one
    travel: e.travelDurationMinutes,
    prep: e.preparationMinutes,
    buffer: e.arrivalBufferMinutes,
    prepStart: plan.preparationStart,
    departure: plan.departureTime,
  }
}

const brief = (i) => ({ eventId: i.eventId, title: i.title, startAt: i.start.toISOString(), endAt: i.end.toISOString(), assumedDuration: i.assumedDuration, destination: i.destination, priority: i.priority ?? 'normal' })
const span = (i) => `${clock(i.start, i.zone)}–${clock(i.end, i.zone)}`

/** Earliest start for B (rounded up to 5 minutes) that would resolve the conflict with A. */
function suggest(a, b, sameLocation) {
  const need = sameLocation ? b.buffer : b.prep + b.travel + b.buffer
  const start = new Date(roundUp5(a.end.getTime() + need * MIN))
  return {
    eventId: b.eventId,
    title: b.title,
    suggestedStartAt: start.toISOString(),
    local: { date: day(start, b.zone), time12: clock(start, b.zone), timezone: b.zone },
    shiftMinutes: Math.round((start.getTime() - b.start.getTime()) / MIN),
    note: 'Suggestion only. Nothing has been changed; edit the event (or just that occurrence) if you want to use it.',
  }
}

/** @param items output of toItem, any order @returns conflicts sorted by severity then time */
export function detectConflicts(items) {
  const sorted = [...items].sort((x, y) => x.start - y.start || x.key.localeCompare(y.key))
  const out = []
  let pairs = 0

  const push = (type, severity, a, b, message, sameLocation) =>
    out.push({ id: `${type}:${a.key}:${b.key}`, type, severity, message, events: [brief(a), brief(b)], suggestion: suggest(a, b, sameLocation) })

  // 1. Overlaps: any later event that starts before an earlier one ends.
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && pairs < MAX_PAIRS; j++) {
      const a = sorted[i]
      const b = sorted[j]
      if (b.start.getTime() > a.end.getTime() + 24 * 60 * MIN) break
      pairs++
      if (b.start < a.end) {
        const same = norm(a.destination) !== '' && norm(a.destination) === norm(b.destination)
        push('OVERLAP', 'high', a, b, `"${a.title}" (${span(a)}) overlaps "${b.title}", which starts at ${clock(b.start, b.zone)}.`, same)
      }
    }
  }

  // 2. Consecutive events: is there time to get ready and to travel?
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (b.start < a.end) continue // already reported as an overlap
    const known = norm(a.destination) !== '' && norm(b.destination) !== ''
    const same = known && norm(a.destination) === norm(b.destination)
    if (same) continue // same place: nothing to travel or prepare
    if (known && b.departure < a.end) {
      const short = Math.ceil((a.end.getTime() - b.departure.getTime()) / MIN)
      push('UNREACHABLE', 'high', a, b, `"${a.title}" ends at ${clock(a.end, a.zone)} but you would have to leave for "${b.title}" (${b.travel} min travel) at ${clock(b.departure, b.zone)}: you cannot get there on time, ${short} min short.`, false)
    } else if (b.prep > 0 && b.prepStart < a.end) {
      const short = Math.ceil((a.end.getTime() - b.prepStart.getTime()) / MIN)
      push('TIGHT_PREPARATION', 'medium', a, b, `Only ${Math.max(0, Math.round((b.start.getTime() - a.end.getTime()) / MIN))} min between "${a.title}" and "${b.title}": its ${b.prep} min preparation would have to start at ${clock(b.prepStart, b.zone)}, ${short} min before "${a.title}" ends.`, false)
    }
  }

  const rank = { high: 0, medium: 1 }
  // Within the same severity, a conflict that involves a HIGH-priority event is listed first; then by time as before.
  const involvesHigh = (c) => (c.events.some((e) => e.priority === 'high') ? 0 : 1)
  return out.sort((x, y) => rank[x.severity] - rank[y.severity] || involvesHigh(x) - involvesHigh(y) || x.events[0].startAt.localeCompare(y.events[0].startAt))
}

export const ASSUMPTIONS = [
  `Events without a duration are assumed to last ${DEFAULT_DURATION_MINUTES} minutes.`,
  "Travel uses each event's own saved travel time. Real-time traffic is not used.",
  'Travel between events is only checked when both events have a destination and the destinations differ.',
]
