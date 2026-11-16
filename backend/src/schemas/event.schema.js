import { z } from 'zod'
import { isDateString, isInstantString, isLocalDateTimeString, isValidTimezone } from '../utils/timezone.js'

export const EVENT_CATEGORIES = ['university', 'office', 'appointment', 'travel', 'personal', 'other']
export const EVENT_SORTS = ['startAt', '-startAt', 'createdAt', '-createdAt']

const timezone = z.string().refine(isValidTimezone, 'Unknown timezone (use an IANA name such as Asia/Dhaka)')

// Client dates are either a LOCAL wall time interpreted in `timezone` ("2026-11-20T10:00")
// or an absolute instant ("2026-11-20T04:00:00Z"). Calendar validity is checked in the service.
const startAt = z
  .string({ error: 'Start date and time is required' })
  .refine((s) => isLocalDateTimeString(s) || isInstantString(s), 'Use YYYY-MM-DDTHH:mm (local time) or an ISO instant with Z/offset')

const optionalText = (max, label) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .transform((s) => (s === '' ? null : s))
    .nullish()

const recurrence = z
  .strictObject({
    frequency: z.enum(['DAILY', 'WEEKLY'], { error: 'Frequency must be DAILY or WEEKLY' }),
    interval: z.number({ error: 'Interval must be a number' }).int().min(1, 'Interval must be at least 1').max(52, 'Interval must be at most 52').default(1),
    daysOfWeek: z
      .array(z.number().int().min(1, 'Weekdays are 1 (Mon) to 7 (Sun)').max(7, 'Weekdays are 1 (Mon) to 7 (Sun)'))
      .min(1, 'Choose at least one weekday')
      .max(7)
      .optional(),
    endsOn: z.string().refine(isDateString, 'Use YYYY-MM-DD').nullish(),
  })
  .refine((r) => r.frequency === 'WEEKLY' || r.daysOfWeek === undefined, {
    path: ['daysOfWeek'],
    message: 'daysOfWeek is only valid for WEEKLY recurrence',
  })

const fields = {
  title: z.string({ error: 'Title is required' }).trim().min(1, 'Title is required').max(150, 'Title must be at most 150 characters'),
  category: z.enum(EVENT_CATEGORIES, { error: `Category must be one of: ${EVENT_CATEGORIES.join(', ')}` }),
  startAt,
  timezone,
  destination: optionalText(255, 'Destination'),
  notes: optionalText(2000, 'Notes'),
  travelDurationMinutes: z.number({ error: 'Travel duration must be a number' }).int('Travel duration must be a whole number').min(1, 'Travel duration must be at least 1 minute').max(1440, 'Travel duration must be at most 1440 minutes'),
  preparationMinutes: z.number({ error: 'Preparation time must be a number' }).int('Preparation time must be a whole number').min(0, 'Preparation time cannot be negative').max(1440, 'Preparation time must be at most 1440 minutes'),
  arrivalBufferMinutes: z.number({ error: 'Arrival buffer must be a number' }).int('Arrival buffer must be a whole number').min(0, 'Arrival buffer cannot be negative').max(1440, 'Arrival buffer must be at most 1440 minutes'),
}

// userId is intentionally NOT accepted: ownership always comes from the verified JWT.
export const createEventSchema = z.strictObject({
  ...fields,
  timezone: timezone.optional(), // defaults to the user's saved timezone preference
  recurrence: recurrence.nullish(),
})

export const updateEventSchema = z
  .strictObject({
    title: fields.title,
    category: fields.category,
    startAt: fields.startAt,
    timezone: fields.timezone,
    destination: fields.destination,
    notes: fields.notes,
    travelDurationMinutes: fields.travelDurationMinutes,
    preparationMinutes: fields.preparationMinutes,
    arrivalBufferMinutes: fields.arrivalBufferMinutes,
    recurrence: recurrence.nullable(), // object = set/replace, null = remove, absent = unchanged
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field to update' })

export const idParamSchema = z.object({ id: z.uuid('Invalid event id') })

const rangeBound = z
  .string()
  .refine((s) => isDateString(s) || isInstantString(s), 'Use YYYY-MM-DD or an ISO instant with Z/offset')
  .optional()

export const listEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  category: z.enum(EVENT_CATEGORIES).optional(),
  from: rangeBound,
  to: rangeBound,
  sort: z.enum(EVENT_SORTS).default('startAt'),
  timezone: timezone.optional(),
})

export const upcomingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

export const occurrencesQuerySchema = z.object({
  from: z.string().refine((s) => isDateString(s) || isInstantString(s), 'Use YYYY-MM-DD or an ISO instant with Z/offset'),
  to: z.string().refine((s) => isDateString(s) || isInstantString(s), 'Use YYYY-MM-DD or an ISO instant with Z/offset'),
  category: z.enum(EVENT_CATEGORIES).optional(),
  timezone: timezone.optional(),
})
