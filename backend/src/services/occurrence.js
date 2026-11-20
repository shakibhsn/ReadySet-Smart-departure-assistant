import { expandOccurrences } from './recurrence.service.js'

// PURE (no database, no clock). The ONE place where "which occurrences does this event have?" is answered:
// the recurrence rule produces the generated occurrences, then per-occurrence exceptions are applied
// (SKIPPED ones disappear, OVERRIDDEN ones change their time / details). Every consumer (event lists, departure
// plans, email reminders, in-app notifications, conflicts) goes through here, so they can never disagree.

/** An override may move an occurrence by at most this many days (keeps range queries bounded and exact). */
export const MAX_SHIFT_DAYS = 7
const DAY = 86_400_000
const OVERRIDE_FIELDS = ['title', 'destination', 'notes', 'travelDurationMinutes', 'preparationMinutes', 'arrivalBufferMinutes', 'durationMinutes']

const seriesOf = (event) => ({ startAt: event.startAt, timezone: event.timezone, rule: event.recurrenceRule })

/** The event as it is for ONE occurrence: the series values with any non-null override fields applied. */
export function mergeOverride(event, exception) {
  if (!exception || exception.kind !== 'OVERRIDDEN') return event
  const merged = { ...event }
  for (const f of OVERRIDE_FIELDS) if (exception[f] !== null && exception[f] !== undefined) merged[f] = exception[f]
  return merged
}

/**
 * @param event  row with `recurrenceRule` and `exceptions` (array, may be empty/undefined)
 * @returns [{ event (merged), at (effective start), originalStart, modified }] sorted by `at`, inside [from, to]
 */
export function occurrencesOf(event, from, to, { max } = {}) {
  if (!event.recurrenceRule) {
    return event.startAt >= from && event.startAt <= to ? [{ event, at: event.startAt, originalStart: event.startAt, modified: false }] : []
  }
  const byOriginal = new Map((event.exceptions ?? []).map((e) => [e.originalStart.getTime(), e]))
  const pad = MAX_SHIFT_DAYS * DAY
  // Expanded over a padded window (an edited occurrence may have moved in or out of the range), then filtered; the
  // expansion itself is capped by MAX_OCCURRENCES, so this is always bounded.
  const originals = expandOccurrences(seriesOf(event), new Date(from.getTime() - pad), new Date(to.getTime() + pad))

  const result = []
  for (const originalStart of originals) {
    const ex = byOriginal.get(originalStart.getTime())
    if (ex?.kind === 'SKIPPED') continue
    const at = ex?.kind === 'OVERRIDDEN' && ex.startAt ? ex.startAt : originalStart
    if (at < from || at > to) continue
    result.push({ event: mergeOverride(event, ex), at, originalStart, modified: ex?.kind === 'OVERRIDDEN' })
  }
  result.sort((a, b) => a.at - b.at)
  return max ? result.slice(0, max) : result
}

/**
 * Finds one occurrence by instant: matches the ORIGINAL generated start or the (possibly moved) effective start.
 * Returns the same shape as occurrencesOf, or null (not an occurrence, or it was skipped).
 */
export function findOccurrence(event, instant) {
  const t = instant.getTime()
  const found = occurrencesOf(event, new Date(t - MAX_SHIFT_DAYS * DAY), new Date(t + MAX_SHIFT_DAYS * DAY)).find((o) => o.at.getTime() === t || o.originalStart.getTime() === t)
  return found ?? null
}

/** Is `instant` one of the series' GENERATED occurrences (ignoring exceptions)? Used to validate skip/edit requests. */
export function isGeneratedOccurrence(event, instant) {
  const [exact] = expandOccurrences(seriesOf(event), instant, instant, { max: 1 })
  return Boolean(exact) && exact.getTime() === instant.getTime()
}

/** The next occurrence at or after `from` (skipped ones are never returned), or null. */
export function nextOccurrence(event, from, horizonDays = 366) {
  return occurrencesOf(event, from, new Date(from.getTime() + horizonDays * DAY), { max: 1 })[0] ?? null
}
