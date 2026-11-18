import { DateTime } from 'luxon'
import { DEFAULT_TIMEZONE, isValidTimezone } from '../../utils/timezone.js'

/**
 * DEPARTURE CALCULATOR (pure: no database, no Express, no clock)
 *
 *   targetArrival    = eventStart    - arrivalBufferMinutes
 *   departureTime    = targetArrival - travelDurationMinutes
 *   preparationStart = departureTime - preparationMinutes
 *   totalRequiredMinutes = preparationMinutes + travelDurationMinutes + arrivalBufferMinutes
 *
 * TIMEZONE STRATEGY
 *  - All arithmetic is done on absolute instants (UTC milliseconds): "35 minutes of travel" is 35
 *    elapsed minutes, which stays correct across midnight and daylight-saving changes.
 *  - The IANA timezone is used ONLY to present instants as local clock times and local dates.
 *  - Calculations never use formatted strings.
 */

const MINUTE_MS = 60_000
export const MAX_DURATION_MINUTES = 1440

/** Last-resort defaults, used only when neither the event nor the user preference has a value. */
export const APP_DEFAULTS = Object.freeze({ preparationMinutes: 30, arrivalBufferMinutes: 10 })

export class DepartureInputError extends Error {
  constructor(field, message) {
    super(message)
    this.name = 'DepartureInputError'
    this.field = field
  }
}

const isMissing = (value) => value === undefined || value === null

function assertMinutes(field, value, min) {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new DepartureInputError(field, `${field} must be a whole number of minutes`)
  if (value < min) throw new DepartureInputError(field, `${field} cannot be less than ${min}`)
  if (value > MAX_DURATION_MINUTES) throw new DepartureInputError(field, `${field} cannot exceed ${MAX_DURATION_MINUTES} minutes`)
}

/**
 * Timezone fallback order: explicit event timezone, then the user's saved timezone, then Asia/Dhaka
 * (the project-wide default). Invalid values are skipped, never trusted.
 */
export function resolveTimezone(...candidates) {
  return candidates.find((tz) => isValidTimezone(tz)) ?? DEFAULT_TIMEZONE
}

/**
 * Duration fallback order per field: 1) explicit value, 2) user preference, 3) application default.
 * Saved event values are never overwritten. Travel time has no sensible default or preference, so it
 * must always be supplied (a plan built on a guessed travel time would be misleading).
 */
export function resolveDurations(explicit = {}, preferences = {}) {
  if (isMissing(explicit.travelDurationMinutes)) throw new DepartureInputError('travelDurationMinutes', 'travelDurationMinutes is required')
  return {
    travelDurationMinutes: explicit.travelDurationMinutes,
    preparationMinutes: explicit.preparationMinutes ?? preferences.defaultPreparationMinutes ?? APP_DEFAULTS.preparationMinutes,
    arrivalBufferMinutes: explicit.arrivalBufferMinutes ?? preferences.defaultArrivalBufferMinutes ?? APP_DEFAULTS.arrivalBufferMinutes,
  }
}

/**
 * @param {{ startAt: Date, timezone: string, travelDurationMinutes: number, preparationMinutes: number, arrivalBufferMinutes: number }} input
 * @returns frozen plan; every time is a Date (absolute instant)
 */
export function calculateDeparturePlan({ startAt, timezone, travelDurationMinutes, preparationMinutes, arrivalBufferMinutes }) {
  if (!(startAt instanceof Date) || Number.isNaN(startAt.getTime())) throw new DepartureInputError('startAt', 'startAt must be a valid date')
  if (!isValidTimezone(timezone)) throw new DepartureInputError('timezone', 'timezone must be a valid IANA timezone')
  assertMinutes('travelDurationMinutes', travelDurationMinutes, 0)
  assertMinutes('preparationMinutes', preparationMinutes, 0)
  assertMinutes('arrivalBufferMinutes', arrivalBufferMinutes, 0)

  const eventStart = new Date(startAt.getTime())
  const targetArrival = new Date(eventStart.getTime() - arrivalBufferMinutes * MINUTE_MS)
  const departureTime = new Date(targetArrival.getTime() - travelDurationMinutes * MINUTE_MS)
  const preparationStart = new Date(departureTime.getTime() - preparationMinutes * MINUTE_MS)

  return Object.freeze({
    timezone,
    eventStart,
    targetArrival,
    departureTime,
    preparationStart,
    durations: Object.freeze({
      preparationMinutes,
      travelDurationMinutes,
      arrivalBufferMinutes,
      totalRequiredMinutes: preparationMinutes + travelDurationMinutes + arrivalBufferMinutes,
    }),
  })
}

/** An instant presented in a timezone: local date, 24h and 12h clock and an ISO string with the zone offset. */
export function toLocalParts(date, timezone) {
  const dt = DateTime.fromJSDate(date, { zone: timezone })
  return {
    date: dt.toFormat('yyyy-MM-dd'),
    time: dt.toFormat('HH:mm'),
    time12: dt.toFormat('h:mm a'),
    iso: dt.toISO(), // e.g. 2026-11-20T08:45:00.000+06:00
  }
}

/** Local presentation of every milestone in the plan's timezone. */
export function localizePlan(plan) {
  const { timezone } = plan
  return {
    timezone,
    preparationStart: toLocalParts(plan.preparationStart, timezone),
    departureTime: toLocalParts(plan.departureTime, timezone),
    targetArrival: toLocalParts(plan.targetArrival, timezone),
    eventStart: toLocalParts(plan.eventStart, timezone),
  }
}
