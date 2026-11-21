import { z } from 'zod'
import { LEAD_CHOICES, PRIORITIES, SNOOZE_CHOICES } from '../services/notification/notificationRules.js'

export const NOTIFICATION_CATEGORIES = ['departure', 'preparation', 'event', 'system']

export const idParamSchema = z.object({ id: z.uuid('Invalid notification id') })

export const listQuerySchema = z.object({
  status: z.enum(['all', 'unread', 'read', 'snoozed'], { error: 'status must be all, unread, read or snoozed' }).default('all'),
  category: z.enum(NOTIFICATION_CATEGORIES, { error: `category must be one of: ${NOTIFICATION_CATEGORIES.join(', ')}` }).optional(),
  priority: z.enum(PRIORITIES, { error: `priority must be one of: ${PRIORITIES.join(', ')}` }).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1, 'limit must be at least 1').max(50, 'limit must be at most 50').default(20),
})

const flag = z.boolean({ error: 'Must be true or false' })
export const updatePreferencesSchema = z
  .strictObject({
    enabled: flag.optional(),
    upcoming: flag.optional(),
    prep: flag.optional(),
    departure: flag.optional(),
    checklist: flag.optional(),
    browser: flag.optional(),
    leadMinutes: z.number({ error: 'leadMinutes must be a number' }).refine((n) => LEAD_CHOICES.includes(n), `leadMinutes must be one of: ${LEAD_CHOICES.join(', ')}`).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one setting to change')

export const snoozeSchema = z.strictObject({ choice: z.enum(SNOOZE_CHOICES, { error: `choice must be one of: ${SNOOZE_CHOICES.join(', ')}` }) })
