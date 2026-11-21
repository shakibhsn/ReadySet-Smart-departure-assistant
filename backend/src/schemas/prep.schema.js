import { z } from 'zod'
import { isInstantString } from '../utils/timezone.js'
import { EVENT_CATEGORIES } from './event.schema.js'

// The client only says WHICH action happened. Timestamps are never accepted from the client.
export const prepActionSchema = z.strictObject({
  action: z.enum(['start', 'ready', 'cancel', 'left'], { error: 'action must be start, ready, cancel or left' }),
  occurrence: z.string().refine(isInstantString, 'Use an ISO instant with Z/offset').optional(),
})
export const prepStateQuerySchema = z.object({ occurrence: z.string().refine(isInstantString, 'Use an ISO instant with Z/offset').optional() })
export const logIdSchema = z.object({ id: z.uuid('Invalid log id') })
export const logsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) })

const minutes = z.number({ error: 'Must be a number' }).int('Must be a whole number').min(0, 'Cannot be negative').max(1440, 'At most 1440 minutes')
const category = z.enum(EVENT_CATEGORIES, { error: `Category must be one of: ${EVENT_CATEGORIES.join(', ')}` })

export const settingsSchema = z.strictObject({ enabled: z.boolean({ error: 'enabled must be true or false' }) })
export const overrideSchema = z
  .strictObject({ category, prepMinutes: minutes.optional(), bufferMinutes: minutes.optional() })
  .refine((v) => v.prepMinutes !== undefined || v.bufferMinutes !== undefined, 'Provide prepMinutes and/or bufferMinutes')
export const overrideParamSchema = z.object({ category })
