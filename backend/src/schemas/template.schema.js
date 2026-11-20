import { z } from 'zod'
import { eventFields, recurrenceSchema } from './event.schema.js'

const name = z.string({ error: 'Template name is required' }).trim().min(1, 'Template name is required').max(80, 'Template name must be at most 80 characters')
// A template repeats by pattern only: it has no start date, so an absolute end date makes no sense (use count).
const templateRecurrence = recurrenceSchema.refine((r) => !r.endsOn, { path: ['endsOn'], message: 'Templates cannot have an end date; use a number of occurrences instead' })

const body = {
  title: eventFields.title,
  category: eventFields.category,
  destination: eventFields.destination,
  notes: eventFields.notes,
  timezone: eventFields.timezone.nullish(),
  travelDurationMinutes: eventFields.travelDurationMinutes,
  preparationMinutes: eventFields.preparationMinutes,
  arrivalBufferMinutes: eventFields.arrivalBufferMinutes,
  durationMinutes: eventFields.durationMinutes,
  recurrence: templateRecurrence.nullish(),
}

// Either copy an existing event of mine (fromEventId) or give the fields explicitly.
export const createTemplateSchema = z.union([
  z.strictObject({ name, fromEventId: z.uuid('Invalid event id') }),
  z.strictObject({ name, ...body }),
])

export const updateTemplateSchema = z
  .strictObject({ name: name.optional(), title: body.title.optional(), category: body.category.optional(), destination: body.destination, notes: body.notes, timezone: body.timezone, travelDurationMinutes: body.travelDurationMinutes.optional(), preparationMinutes: body.preparationMinutes.optional(), arrivalBufferMinutes: body.arrivalBufferMinutes.optional(), durationMinutes: body.durationMinutes, recurrence: templateRecurrence.nullable().optional() })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to change')

export const templateIdSchema = z.object({ id: z.uuid('Invalid template id') })

export const useTemplateSchema = z.strictObject({ startAt: eventFields.startAt, timezone: eventFields.timezone.optional() })
