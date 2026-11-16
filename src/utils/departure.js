import { differenceInSeconds, format, isValid, parse, subMinutes } from 'date-fns'

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
 * Core departure formulas (pure and reusable):
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

/** Convenience wrapper for event objects in the app's mock data shape. */
export function getEventDeparture(event) {
  return calculateDeparture(parseDateTime(event.date, event.startTime), {
    travelMinutes: event.travelMinutes,
    bufferMinutes: event.bufferMinutes,
    prepMinutes: event.prepMinutes,
  })
}

/** Split the time remaining until `target` into parts. Past targets clamp to 0. */
export function getCountdown(target, now = new Date()) {
  const diff = differenceInSeconds(target, now)
  const total = Math.max(0, diff)
  return {
    total,
    isPast: diff <= 0,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

export const formatClock = (date) => (date ? format(date, 'h:mm a') : '—')
