import { z } from 'zod'
import { isInstantString } from '../utils/timezone.js'
import { eventFields } from './event.schema.js'

const originalStart = z.string({ error: 'originalStart is required' }).refine(isInstantString, 'Use an ISO instant with Z/offset (the occurrence startAt or originalStart returned by the API)')

export const occurrenceRefSchema = z.strictObject({ originalStart })

// Full set of overrides for ONE occurrence: anything omitted goes back to the series value.
export const overrideOccurrenceSchema = z
  .strictObject({
    originalStart,
    title: eventFields.title.optional(),
    destination: eventFields.destination,
    notes: eventFields.notes,
    startAt: eventFields.startAt.optional(),
    travelDurationMinutes: eventFields.travelDurationMinutes.optional(),
    preparationMinutes: eventFields.preparationMinutes.optional(),
    arrivalBufferMinutes: eventFields.arrivalBufferMinutes.optional(),
    durationMinutes: eventFields.durationMinutes,
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'originalStart' && v[k] !== undefined), 'Provide at least one value to change for this occurrence')
