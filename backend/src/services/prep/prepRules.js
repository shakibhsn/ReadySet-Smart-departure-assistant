// PURE (no database, no clock): the transparent, rule-based preparation profile.
// Nothing here guesses: every number comes from logs the user created by tapping "Start preparing" / "I'm ready" / "I left"
// (timestamps written by the server). Checklist activity is never used to infer preparation time.

export const MIN_SAMPLES = 3 // fewer valid logs than this -> no recommendation at all
export const MAX_SAMPLES = 20 // most recent valid logs used per scope
export const WINDOW_DAYS = 180
export const PREP_VALID_MINUTES = [2, 480] // a "start -> ready" outside this range is treated as a mistake, not data
export const LATENESS_VALID_MINUTES = [-180, 240] // "left - planned departure" outside this range is ignored
export const ON_TIME_GRACE_MINUTES = 5
export const MAX_BUFFER_EXTRA = 30
export const ROUND_TO = 5
const MIN = 60_000

export const minutesBetween = (a, b) => (b.getTime() - a.getTime()) / MIN

// ---------------- the state machine (sequence validation, idempotent taps) ----------------

/**
 * Applies one tap to a log. `log` has prepStartedAt / readyAt / cancelledAt / leftAt (Dates or null).
 * Returns { changed, patch } or { error }. Repeating a tap NEVER changes or duplicates anything (changed: false).
 * Rules: ready needs a started, not cancelled session; times only move forward; nothing can be recorded after leaving
 * except cancel is refused too; a cancelled session can be restarted (new start, cancel cleared) only if not ready.
 */
export function applyAction(log, action, now) {
  const l = log ?? {}
  switch (action) {
    case 'start':
      if (l.prepStartedAt && !l.cancelledAt) return { changed: false, patch: {} } // already started (even if finished or left): a repeated tap is a harmless no-op
      if (l.leftAt) return { error: 'You already left, so preparation cannot be started now.' }
      return { changed: true, patch: { prepStartedAt: now, cancelledAt: null } } // first start, or a restart after cancel
    case 'ready':
      if (l.readyAt) return { changed: false, patch: {} }
      if (!l.prepStartedAt || l.cancelledAt) return { error: 'Tap "Start preparing" first.' }
      if (l.leftAt) return { error: 'You already left, so "ready" cannot be recorded after that.' }
      if (now <= l.prepStartedAt) return { error: 'Ready must be after the start.' }
      return { changed: true, patch: { readyAt: now } }
    case 'cancel':
      if (l.cancelledAt) return { changed: false, patch: {} }
      if (l.readyAt) return { error: 'This preparation is already finished.' }
      if (!l.prepStartedAt) return { error: 'Preparation was not started.' }
      return { changed: true, patch: { cancelledAt: now } }
    case 'left':
      if (l.leftAt) return { changed: false, patch: {} }
      if (l.prepStartedAt && now < l.prepStartedAt) return { error: 'Invalid time order.' }
      return { changed: true, patch: { leftAt: now } }
    default:
      return { error: 'Unknown action.' }
  }
}

// ---------------- what counts as reliable data ----------------

/** Minutes from "start" to "ready", or null when the session is incomplete, cancelled, or implausible. */
export function actualPrepMinutes(log) {
  if (!log.prepStartedAt || !log.readyAt || log.cancelledAt) return null
  const m = minutesBetween(log.prepStartedAt, log.readyAt)
  return m >= PREP_VALID_MINUTES[0] && m <= PREP_VALID_MINUTES[1] ? Math.round(m) : null
}

/**
 * Lateness in minutes, >= 0. Leaving EARLY is not lateness (it counts as 0). null when there is no departure tap
 * or the value is implausible.
 */
export function latenessMinutes(log) {
  if (!log.leftAt) return null
  const m = minutesBetween(log.plannedDepartureAt, log.leftAt)
  if (m < LATENESS_VALID_MINUTES[0] || m > LATENESS_VALID_MINUTES[1]) return null
  return Math.max(0, Math.round(m))
}

// ---------------- statistics ----------------

/** Nearest-rank percentile (p in 0..100) of a non-empty list. */
export function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length))
  return sorted[rank - 1]
}
export const median = (values) => percentile(values, 50)
export const roundUpTo = (n, step = ROUND_TO) => Math.ceil(n / step) * step

/** low: 3-4 samples, medium: 5-9, high: 10+. A wide spread (IQR > 50% of the median) lowers it by one level. */
export function confidenceFor(values) {
  const n = values.length
  let level = n >= 10 ? 2 : n >= 5 ? 1 : 0
  const med = median(values)
  if (med > 0 && (percentile(values, 75) - percentile(values, 25)) / med > 0.5) level = Math.max(0, level - 1)
  return ['low', 'medium', 'high'][level]
}

const insufficient = (samples, what) => ({
  status: 'insufficient_data',
  samples,
  needed: MIN_SAMPLES,
  message: `Not enough history yet: ${samples} of ${MIN_SAMPLES} logged ${what}. Keep tapping "Start preparing" and "I'm ready" on your events.`,
})

/** Preparation-time suggestion from a list of actual durations (minutes), most recent first. */
export function suggestPrep(durations) {
  const values = durations.slice(0, MAX_SAMPLES)
  if (values.length < MIN_SAMPLES) return insufficient(values.length, 'preparations')
  const p75 = percentile(values, 75)
  return {
    status: 'ok',
    minutes: Math.max(ROUND_TO, roundUpTo(p75)),
    samples: values.length,
    confidence: confidenceFor(values),
    medianMinutes: Math.round(median(values)),
    explanation: `Based on your last ${values.length} logged preparations: typical (median) ${Math.round(median(values))} min; suggested = the 75th percentile (${p75} min) rounded up to the next ${ROUND_TO} min, so it covers most of your days.`,
  }
}

/**
 * Departure-buffer formula (documented, deterministic):
 *   lateness_i       = max(0, left_at - planned_departure)   (leaving early counts as 0, never as lateness)
 *   extra            = min(30, roundUpTo5(p75(lateness_i)))   over the last 20 valid departures
 *   recommended      = current buffer + extra
 */
export function suggestBuffer(latenesses, currentBuffer) {
  const values = latenesses.slice(0, MAX_SAMPLES)
  if (values.length < MIN_SAMPLES) return insufficient(values.length, 'departures')
  const p75 = percentile(values, 75)
  const extra = Math.min(MAX_BUFFER_EXTRA, roundUpTo(p75))
  const late = values.filter((v) => v > ON_TIME_GRACE_MINUTES).length
  return {
    status: 'ok',
    minutes: currentBuffer + extra,
    extraMinutes: extra,
    currentBuffer,
    samples: values.length,
    confidence: confidenceFor(values),
    lateDepartures: late,
    explanation: `You left more than ${ON_TIME_GRACE_MINUTES} min after the planned time in ${late} of your last ${values.length} logged departures. Formula: extra = 75th percentile of lateness (${p75} min, early departures count as 0) rounded up to ${ROUND_TO} min, at most ${MAX_BUFFER_EXTRA}; recommended buffer = your current ${currentBuffer} min + ${extra} min.`,
  }
}

/** Weekly habit summary over logs whose occurrence started in the last 7 days. */
export function weeklySummary(logs, now) {
  const since = new Date(now.getTime() - 7 * 86_400_000)
  const week = logs.filter((l) => l.occurrenceStart >= since && l.occurrenceStart <= now)
  const durations = week.map((l) => ({ planned: l.plannedPrepMinutes, actual: actualPrepMinutes(l) })).filter((d) => d.actual !== null)
  const latenesses = week.map(latenessMinutes).filter((v) => v !== null)
  const counts = new Map()
  for (const l of week) for (const name of Array.isArray(l.uncheckedItems) ? l.uncheckedItems : []) { const key = name.trim().toLowerCase(); counts.set(key, { name: counts.get(key)?.name ?? name.trim(), n: (counts.get(key)?.n ?? 0) + 1 }) }
  return {
    from: since.toISOString(),
    to: now.toISOString(),
    eventsLogged: week.length,
    preparationsMeasured: durations.length,
    avgPlannedPrepMinutes: durations.length ? Math.round(durations.reduce((s, d) => s + d.planned, 0) / durations.length) : null,
    avgActualPrepMinutes: durations.length ? Math.round(durations.reduce((s, d) => s + d.actual, 0) / durations.length) : null,
    departuresLogged: latenesses.length,
    onTimeDepartures: latenesses.filter((v) => v <= ON_TIME_GRACE_MINUTES).length,
    uncheckedWhenLeaving: [...counts.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 5).map((c) => ({ name: c.name, times: c.n })),
    message: week.length === 0 ? 'No activity logged this week. Tap "Start preparing" on an event to build your profile.' : null,
  }
}

/** Items that were still unchecked when the user left on at least 2 logged departures (NOT "forgotten": the user may just not tick). */
export function oftenUnchecked(logs) {
  const counts = new Map()
  for (const l of logs) for (const name of Array.isArray(l.uncheckedItems) ? l.uncheckedItems : []) {
    const key = name.trim().toLowerCase()
    counts.set(key, { name: counts.get(key)?.name ?? name.trim(), n: (counts.get(key)?.n ?? 0) + 1 })
  }
  return [...counts.values()].filter((c) => c.n >= 2).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 10).map((c) => ({ name: c.name, times: c.n }))
}

/** Full profile from logs. The user's own overrides are applied by the UI/service on top; they never feed back into these numbers. */
export function buildProfile({ logs, defaultBuffer = 10, now = new Date() }) {
  const newestFirst = [...logs].sort((a, b) => b.occurrenceStart - a.occurrenceStart)
  const byCategory = {}
  const all = []
  for (const l of newestFirst) {
    const m = actualPrepMinutes(l)
    if (m === null) continue
    all.push(m)
    ;(byCategory[l.category] ??= []).push(m)
  }
  const prep = Object.fromEntries(Object.entries(byCategory).map(([c, v]) => [c, suggestPrep(v)]))
  const latenesses = newestFirst.map(latenessMinutes).filter((v) => v !== null)
  return {
    minSamples: MIN_SAMPLES,
    preparation: { overall: suggestPrep(all), byCategory: prep },
    buffer: suggestBuffer(latenesses, defaultBuffer),
    weekly: weeklySummary(newestFirst, now),
    oftenUnchecked: oftenUnchecked(newestFirst),
  }
}
