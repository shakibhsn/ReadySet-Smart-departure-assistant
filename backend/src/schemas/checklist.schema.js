import { z } from 'zod'
import { CHECKLIST_GROUPS, TEMPLATE_KEYS } from '../services/checklist/checklistTemplates.js'

const text = z.string({ error: 'Item name is required' }).trim().min(1, 'Item name is required').max(120, 'Item name must be at most 120 characters')
const group = z.enum(CHECKLIST_GROUPS, { error: `Group must be one of: ${CHECKLIST_GROUPS.join(', ')}` })

export const eventIdParamSchema = z.object({ id: z.uuid('Invalid event id') })
export { text as itemTextSchema, group as itemGroupSchema }
export const itemParamSchema = z.object({ id: z.uuid('Invalid event id'), itemId: z.uuid('Invalid item id') })

export const createItemSchema = z.strictObject({ text, group: group.default('Essentials') })

export const updateItemSchema = z
  .strictObject({ text: text.optional(), group: group.optional(), done: z.boolean({ error: 'done must be true or false' }).optional() })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to change')

// baseUpdatedAt (optional): the item's updatedAt as the client last saw it. Used by offline sync to detect that the item changed meanwhile.
export const completionSchema = z.strictObject({ done: z.boolean({ error: 'done must be true or false' }), baseUpdatedAt: z.iso.datetime({ error: 'baseUpdatedAt must be an ISO date-time' }).optional() })

// With no template given, the one matching the event's category is used.
export const applyTemplateSchema = z
  .strictObject({
    template: z.enum(TEMPLATE_KEYS, { error: `Template must be one of: ${TEMPLATE_KEYS.join(', ')}` }).optional(),
    personalTemplateId: z.uuid('Invalid template id').optional(), // one of the user's own packing templates
  })
  .refine((v) => !(v.template && v.personalTemplateId), { path: ['personalTemplateId'], message: 'Choose either a built-in template or one of your own, not both' })
