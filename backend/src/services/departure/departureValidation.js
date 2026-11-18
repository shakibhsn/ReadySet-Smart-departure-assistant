import { z } from 'zod'
import { isInstantString, isLocalDateTimeString, isValidTimezone } from '../../utils/timezone.js'
import { MAX_DURATION_MINUTES } from './departureCalculator.js'

const timezone = z.string().refine(isValidTimezone, 'Unknown timezone (use an IANA name such as Asia/Dhaka)')

const minutes = (label, min) =>
  z
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number of minutes`)
    .min(min, min === 0 ? `${label} cannot be negative` : `${label} must be at least ${min} minute`)
    .max(MAX_DURATION_MINUTES, `${label} must be at most ${MAX_DURATION_MINUTES} minutes`)

/**
 * Preview input. `startAt` is a LOCAL wall time interpreted in `timezone` ("2026-11-20T10:00") or an
 * absolute instant ("...Z"). Preparation / buffer are optional: they fall back to the user's saved
 * preferences, then to the application defaults. Travel time is always required.
 */
export const previewDepartureSchema = z.strictObject({
  startAt: z
    .string({ error: 'Start date and time is required' })
    .refine((s) => isLocalDateTimeString(s) || isInstantString(s), 'Use YYYY-MM-DDTHH:mm (local time) or an ISO instant with Z/offset'),
  timezone: timezone.optional(),
  travelDurationMinutes: minutes('Travel duration', 1),
  preparationMinutes: minutes('Preparation time', 0).optional(),
  arrivalBufferMinutes: minutes('Arrival buffer', 0).optional(),
})

export const departurePlanQuerySchema = z.object({
  // A specific occurrence of a recurring event (its exact start instant). Defaults to the next one.
  occurrence: z.string().refine(isInstantString, 'Use an ISO instant with Z/offset').optional(),
})

export const todayPlansQuerySchema = z.object({ timezone: timezone.optional() })

export const upcomingPlansQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

