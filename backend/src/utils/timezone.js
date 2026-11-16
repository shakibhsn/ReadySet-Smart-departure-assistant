import { DateTime, IANAZone } from 'luxon'

export const DEFAULT_TIMEZONE = 'Asia/Dhaka'

export const isValidTimezone = (tz) => typeof tz === 'string' && tz.length > 0 && tz.length <= 64 && IANAZone.isValidZone(tz)

// "2026-11-20T10:00" or "2026-11-20T10:00:00": a LOCAL wall-clock time with no offset.
const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/
// "2026-11-20T04:00:00Z" or "...+06:00": an absolute instant.
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const isLocalDateTimeString = (s) => LOCAL_RE.test(s)
export const isInstantString = (s) => INSTANT_RE.test(s)
export const isDateString = (s) => DATE_RE.test(s)

/**
 * Converts a client date-time into a Luxon DateTime expressed in `timezone`.
 *  - Local wall time (no offset) is interpreted IN `timezone` (never as UTC and never in the
 *    server's or browser's zone). DST gaps move forward to the next valid time (Luxon behaviour).
 *  - A string with Z / an offset is an absolute instant and is only displayed in `timezone`.
 * Returns null when the string is not a real date (e.g. 2026-02-30).
 */
export function parseStart(input, timezone) {
  let dt = null
  if (LOCAL_RE.test(input)) dt = DateTime.fromISO(input, { zone: timezone })
  else if (INSTANT_RE.test(input)) dt = DateTime.fromISO(input, { setZone: true }).setZone(timezone)
  return dt?.isValid ? dt : null
}

/** "yyyy-MM-dd" in `timezone` -> start of that local day (null if not a real date). */
export function startOfLocalDay(dateString, timezone) {
  const dt = DATE_RE.test(dateString) ? DateTime.fromISO(dateString, { zone: timezone }) : null
  return dt?.isValid ? dt.startOf('day') : null
}

export const toZone = (date, timezone) => DateTime.fromJSDate(date, { zone: timezone })

/** Local calendar date and clock time of an instant in a zone, e.g. { localDate: '2026-11-20', localTime: '10:00' }. */
export function localParts(date, timezone) {
  const dt = toZone(date, timezone)
  return { localDate: dt.toFormat('yyyy-MM-dd'), localTime: dt.toFormat('HH:mm') }
}
