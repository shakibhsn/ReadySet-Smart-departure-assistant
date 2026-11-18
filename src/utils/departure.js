import { isValid, parse, subMinutes } from 'date-fns'

/** Parse a "yyyy-MM-dd" date and "HH:mm" time into a Date. Returns null if invalid. */
export function parseDateTime(date, time) {
  if (!date || !time) return null
  const parsed = parse(`${date} ${time}`, 'yyyy-MM-dd HH:mm', new Date())
  return isValid(parsed) ? parsed : null
}

const toMinutes = (value) => {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/**
 * Client-side quick preview used while typing in the event form. The AUTHORITATIVE calculation is
 * the backend departure engine (backend/src/services/departure); everything else in the UI shows
 * plans returned by it. Same formulas:
 *   Target Arrival    = Event Time     - Arrival Buffer
 *   Departure Time    = Target Arrival - Travel Duration
 *   Preparation Start = Departure Time - Preparation Time
 *
 * @param {Date} eventStart
 * @param {{ travelMinutes: number, bufferMinutes: number, prepMinutes: number }} opts
 * @returns {{ eventStart: Date, targetArrival: Date, departure: Date, prepStart: Date } | null}
 */
export function calculateDeparture(eventStart, { travelMinutes, bufferMinutes, prepMinutes }) {
  if (!(eventStart instanceof Date) || !isValid(eventStart)) return null
  const targetArrival = subMinutes(eventStart, toMinutes(bufferMinutes))
  const departure = subMinutes(targetArrival, toMinutes(travelMinutes))
  const prepStart = subMinutes(departure, toMinutes(prepMinutes))
  return { eventStart, targetArrival, departure, prepStart }
}

/** "9:15 AM". Pass an IANA timeZone to show the clock time in that zone instead of the browser's. */
export const formatClock = (date, timeZone) =>
  date
    ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, ...(timeZone && { timeZone }) }).format(date).replace(/\s+/g, ' ')
    : '—'
