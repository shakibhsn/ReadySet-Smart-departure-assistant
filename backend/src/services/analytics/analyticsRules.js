import { DateTime } from 'luxon'
import { MIN_SAMPLES, ON_TIME_GRACE_MINUTES, actualPrepMinutes, latenessMinutes } from '../prep/prepRules.js'

// PURE analytics (no database, no clock). Every number is computed from the rows it is given: nothing is
// estimated, smoothed, defaulted or invented. When there is too little data the metric says so instead of showing a number.

export const MAX_RANGE_DAYS = 366
export const MAX_BUCKETS = 60
export const GRANULARITIES = ['week', 'month']
export { MIN_SAMPLES }

/** A percentage metric, or an explicit "not enough data" (never a misleading 0% or 100% from one data point). */
export function rate(numerator, denominator) {
  if (denominator < MIN_SAMPLES) return { status: 'insufficient_data', samples: denominator, needed: MIN_SAMPLES }
  return { status: 'ok', percent: Math.round((numerator / denominator) * 100), count: numerator, of: denominator }
}

export function average(values) {
  if (values.length < MIN_SAMPLES) return { status: 'insufficient_data', samples: values.length, needed: MIN_SAMPLES }
  return { status: 'ok', minutes: Math.round(values.reduce((a, b) => a + b, 0) / values.length), samples: values.length }
}

/** Calendar weeks (Monday start) or months covering [from, to), in the user's timezone. */
export function bucketsFor(from, to, timezone, granularity) {
  const unit = granularity === 'month' ? 'month' : 'week'
  const out = []
  let cursor = DateTime.fromJSDate(from, { zone: timezone }).startOf(unit)
  while (cursor.toMillis() < to.getTime() && out.length < MAX_BUCKETS) {
    const next = cursor.plus({ [`${unit}s`]: 1 })
    out.push({ key: cursor.toFormat('yyyy-MM-dd'), label: unit === 'month' ? cursor.toFormat('LLL yyyy') : `Week of ${cursor.toFormat('LLL d')}`, start: cursor.toJSDate(), end: next.toJSDate() })
    cursor = next
  }
  return out
}

const keyOf = (eventId, instant) => `${eventId}|${new Date(instant).getTime()}`
const inBucket = (date, b) => date >= b.start && date < b.end

/**
 * @param occurrences [{ eventId, start: Date, originalStart: Date, preparationMinutes }] inside the range
 * @param logs        preparation_logs rows inside the range (or [] when unavailable)
 * @param items       [{ eventId, done }] checklist items of the events that occur in the range
 */
export function buildAnalytics({ occurrences, logs, items, from, to, timezone, granularity = 'week', now, preparationAvailable = true, completedInRange = null }) {
  const past = occurrences.filter((o) => o.start < now)
  const needingPrep = past.filter((o) => o.preparationMinutes > 0)
  const logByKey = new Map(logs.map((l) => [keyOf(l.eventId, l.occurrenceStart), l]))
  const completedPrep = (o) => {
    const l = logByKey.get(keyOf(o.eventId, o.originalStart))
    return Boolean(l?.prepStartedAt && l.readyAt && !l.cancelledAt)
  }
  const prepMinutesOf = (list) => list.map(actualPrepMinutes).filter((m) => m !== null)
  const latenessOf = (list) => list.map(latenessMinutes).filter((m) => m !== null)
  const onTime = (list) => { const v = latenessOf(list); return rate(v.filter((m) => m <= ON_TIME_GRACE_MINUTES).length, v.length) }
  const doneOf = (list) => list.filter((i) => i.done).length

  const trend = bucketsFor(from, to, timezone, granularity).map((b) => {
    const occ = occurrences.filter((o) => inBucket(o.start, b))
    const pastOcc = occ.filter((o) => o.start < now && o.preparationMinutes > 0)
    const bLogs = logs.filter((l) => inBucket(l.occurrenceStart, b))
    const ids = new Set(occ.map((o) => o.eventId))
    const its = items.filter((i) => ids.has(i.eventId))
    return {
      key: b.key,
      label: b.label,
      start: b.start.toISOString(),
      events: occ.length,
      preparationCompletion: preparationAvailable ? rate(pastOcc.filter(completedPrep).length, pastOcc.length) : null,
      averagePrep: preparationAvailable ? average(prepMinutesOf(bLogs)) : null,
      onTime: preparationAvailable ? onTime(bLogs) : null,
      checklist: rate(doneOf(its), its.length),
    }
  })

  return {
    range: { from: from.toISOString(), to: to.toISOString(), granularity, timezone },
    hasEvents: occurrences.length > 0,
    preparationTracking: preparationAvailable ? 'available' : 'unavailable',
    totals: { scheduled: occurrences.length, past: past.length, upcoming: occurrences.length - past.length },
    preparation: preparationAvailable
      ? { completion: rate(needingPrep.filter(completedPrep).length, needingPrep.length), average: average(prepMinutesOf(logs)), loggedSessions: logs.length }
      : null,
    departure: preparationAvailable ? { onTime: onTime(logs), graceMinutes: ON_TIME_GRACE_MINUTES } : null,
    checklist: { rate: rate(doneOf(items), items.length), totalItems: items.length, doneItems: doneOf(items), completedInRange },
    trend,
    notes: [
      'Only events and logs in the selected range are counted. A figure appears once there are at least 3 data points.',
      'Preparation and departure figures come from the "Start preparing", "I\'m ready" and "I left" taps you made. Nothing is guessed from other activity.',
      `On time means leaving no more than ${ON_TIME_GRACE_MINUTES} minutes after the planned departure; leaving early counts as on time.`,
    ],
  }
}

/** Preparation workload (sum of preparation minutes) per local day, for the weekly planner. */
export function workloadByDay(days, items) {
  return days.map((d) => {
    const day = items.filter((i) => i.localDate === d.date)
    return { date: d.date, minutes: day.reduce((s, i) => s + i.preparationMinutes, 0), events: day.length }
  })
}
