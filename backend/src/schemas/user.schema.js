import { z } from 'zod'

export const TRAVEL_MODES = ['manual', 'walk', 'transit', 'drive', 'bike']

const isValidTimezone = (tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// strictObject rejects unknown keys, so protected fields (id, passwordHash, role, email...)
// can never be changed through these endpoints.
export const updateProfileSchema = z
  .strictObject({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name must be at most 100 characters'),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field to update' })

export const updatePreferencesSchema = z
  .strictObject({
    defaultPreparationMinutes: z.number().int().min(0).max(600),
    defaultArrivalBufferMinutes: z.number().int().min(0).max(240),
    preferredTravelMode: z.enum(TRAVEL_MODES, { error: `Travel mode must be one of: ${TRAVEL_MODES.join(', ')}` }),
    timezone: z.string().max(64).refine(isValidTimezone, 'Unknown timezone'),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field to update' })
