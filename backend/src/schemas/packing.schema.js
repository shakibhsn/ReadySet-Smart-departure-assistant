import { z } from 'zod'
import { CHECKLIST_GROUPS, TEMPLATE_KEYS } from '../services/checklist/checklistTemplates.js'

// No control characters / line breaks in names or addresses.
const hasControl = (text) => [...text].some((c) => c.codePointAt(0) < 32 || c.codePointAt(0) === 127)

const plain = (max, label) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`).refine((s) => !hasControl(s), `${label} cannot contain control characters or line breaks`)

// ---------- saved places ----------
export const PLACE_KINDS = ['home', 'office', 'university', 'other']
const label = plain(60, 'Place name')
const address = plain(255, 'Address')
const kind = z.enum(PLACE_KINDS, { error: `Kind must be one of: ${PLACE_KINDS.join(', ')}` })

export const createPlaceSchema = z.strictObject({ label, kind: kind.default('other'), address, makeDefault: z.boolean().optional() })
export const updatePlaceSchema = z.strictObject({ label: label.optional(), kind: kind.optional(), address: address.optional() }).refine((v) => Object.keys(v).length > 0, 'Provide at least one field to change')
export const placeIdSchema = z.object({ id: z.uuid('Invalid place id') })
export const defaultPlaceSchema = z.strictObject({ placeId: z.uuid('Invalid place id').nullable() })

// ---------- personal packing templates ----------
const item = z.strictObject({
  text: plain(120, 'Item name'),
  group: z.enum(CHECKLIST_GROUPS, { error: `Group must be one of: ${CHECKLIST_GROUPS.join(', ')}` }).default('Essentials'),
})
const items = z.array(item).min(1, 'Add at least one item').max(100, 'A template can have at most 100 items')
const templateName = plain(80, 'Template name')

export const createPackingTemplateSchema = z.union([
  z.strictObject({ name: templateName, fromEventId: z.uuid('Invalid event id') }),
  z.strictObject({ name: templateName, items }),
])
export const updatePackingTemplateSchema = z.strictObject({ name: templateName.optional(), items: items.optional() }).refine((v) => Object.keys(v).length > 0, 'Provide at least one field to change')
export const packingTemplateIdSchema = z.object({ id: z.uuid('Invalid template id') })

export const suggestionsQuerySchema = z.object({ category: z.enum(TEMPLATE_KEYS, { error: `category must be one of: ${TEMPLATE_KEYS.join(', ')}` }) })
