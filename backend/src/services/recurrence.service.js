import { DateTime } from 'luxon'

/**
 * Recurrence calculation (pure, no database access).
 *
 * HOW OCCURRENCES ARE CALCULATED
 * A series is an event (start instant + IANA timezone) plus a stored rule:
 *   { frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY', interval, daysOfWeek (ISO 1=Mon..7=Sun, WEEKLY only), endsAt }
 * No rows are generated. For a requested range we walk the LOCAL calendar days of the event's
 * timezone and keep the days that match the rule:
 *   - DAILY : day index d = whole local days since the first day; keep when d % interval === 0.
 *   - WEEKLY: week index w = floor((d + weekdayOfFirstDay - 1) / 7), weeks anchored on Monday;
 *             keep when w % interval === 0 and the day's ISO weekday is in daysOfWeek.
 *   - MONTHLY: month index m = whole local months since the first month; keep when m % interval === 0 and the day is
 *             the first event's day-of-month (clamped to the last day of shorter months: the 31st becomes the 30th/28th).
 * Each kept day gets the ORIGINAL local clock time (e.g. 09:00) in the event's timezone, so the
 * local time stays fixed across DST changes while the UTC instant shifts.
 * Occurrences are produced in strictly increasing order from distinct days, so they can never
 * repeat. A hard cap protects against huge ranges.
 *
 * LIMITATIONS: no yearly rule; a local time that does not exist on a DST-gap day moves forward to the next valid
 * time. Skipped / edited occurrences are applied by services/occurrence.js, not here (this module stays pure).
 */

export const MAX_OCCURRENCES = 500
const dayNumber = (dt) => Math.round(Date.UTC(dt.year, dt.month - 1, dt.day) / 86_400_000)

/**
 * @param {{ startAt: Date, timezone: string, rule?: { frequency: string, interval: number, daysOfWeek: number[], endsAt: Date|null } | null }} series
 * @param {Date} rangeStart inclusive
 * @param {Date} rangeEnd inclusive
 * @param {{ max?: number }} [options]
 * @returns {Date[]} occurrence start instants, ascending, without duplicates
 */
export function expandOccurrences({ startAt, timezone, rule }, rangeStart, rangeEnd, { max = MAX_OCCURRENCES } = {}) {
  if (!(rangeStart <= rangeEnd)) return []

  if (!rule) return startAt >= rangeStart && startAt <= rangeEnd ? [startAt] : []

  const interval = Math.max(1, rule.interval || 1)
  if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(rule.frequency)) return [] // unsupported rule: no occurrences
  if (rule.frequency === 'WEEKLY' && !rule.daysOfWeek?.length) return []

  const first = DateTime.fromJSDate(startAt, { zone: timezone })
  const firstDay = first.startOf('day')
  const firstDayNumber = dayNumber(firstDay)
  const clock = { hour: first.hour, minute: first.minute, second: first.second, millisecond: first.millisecond }

  const last = rule.endsAt && rule.endsAt < rangeEnd ? rule.endsAt : rangeEnd
  // Start one local day before the range so a zone offset can never skip a boundary day.
  const rangeFirstDay = DateTime.fromJSDate(rangeStart, { zone: timezone }).startOf('day').minus({ days: 1 })
  let day = rangeFirstDay > firstDay ? rangeFirstDay : firstDay

  const result = []
  const seen = new Set()
  while (result.length < max) {
    const occurrence = day.set(clock)
    if (occurrence.toMillis() > last.getTime()) break

    const d = dayNumber(day) - firstDayNumber
    const monthsSince = (day.year - firstDay.year) * 12 + (day.month - firstDay.month)
    const matches =
      rule.frequency === 'DAILY'
        ? d % interval === 0
        : rule.frequency === 'MONTHLY'
          ? monthsSince % interval === 0 && day.day === Math.min(firstDay.day, day.daysInMonth)
          : Math.floor((d + firstDay.weekday - 1) / 7) % interval === 0 && rule.daysOfWeek.includes(day.weekday)

    const ms = occurrence.toMillis()
    if (matches && ms >= startAt.getTime() && ms >= rangeStart.getTime() && !seen.has(ms)) {
      seen.add(ms)
      result.push(occurrence.toJSDate())
    }
    day = day.plus({ days: 1 })
  }
  return result
}

/**
 * For "ends after N occurrences": the start instant of the Nth occurrence (null if the rule cannot produce N within
 * the safety window). The caller stores the end of that local day as the rule's endsAt, so every reader keeps using
 * endsAt only.
 */
export function nthOccurrence({ startAt, timezone, rule }, n, { horizonDays = 3660 } = {}) {
  const end = new Date(startAt.getTime() + horizonDays * 86_400_000)
  const list = expandOccurrences({ startAt, timezone, rule: { ...rule, endsAt: null } }, startAt, end, { max: n })
  return list.length === n ? list[n - 1] : null
}
