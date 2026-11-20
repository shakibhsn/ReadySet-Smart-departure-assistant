import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPackingTemplateSchema, createPlaceSchema, defaultPlaceSchema, updatePlaceSchema } from '../src/schemas/packing.schema.js'
import { applyTemplateSchema } from '../src/schemas/checklist.schema.js'
import { EVENT_CATEGORIES } from '../src/schemas/event.schema.js'
import { CHECKLIST_TEMPLATES } from '../src/services/checklist/checklistTemplates.js'
import { dedupeItems, textKeyOf } from '../src/services/packing.service.js'

// Pure: no database, no network.
describe('saved place validation', () => {
  it('accepts a normal place, trims it and defaults the kind', () => {
    expect(createPlaceSchema.parse({ label: '  Home ', address: ' 12 Lake Road, Dhaka ' })).toEqual({ label: 'Home', kind: 'other', address: '12 Lake Road, Dhaka' })
  })
  it.each([
    ['empty name', { label: '  ', address: 'x' }],
    ['name too long', { label: 'x'.repeat(61), address: 'x' }],
    ['empty address', { label: 'Home', address: '' }],
    ['address too long', { label: 'Home', address: 'x'.repeat(256) }],
    ['line break in address', { label: 'Home', address: 'line1\nline2' }],
    ['control character in name', { label: 'Ho\u0007me', address: 'x' }],
    ['unknown kind', { label: 'Home', address: 'x', kind: 'castle' }],
    ['owner injection', { label: 'Home', address: 'x', userId: 'abc' }],
    ['coordinates are not stored', { label: 'Home', address: 'x', lat: 1, lng: 2 }],
  ])('rejects %s', (_name, body) => expect(createPlaceSchema.safeParse(body).success).toBe(false))
  it('updates need at least one field; the default place takes a UUID or null only', () => {
    expect(updatePlaceSchema.safeParse({}).success).toBe(false)
    expect(updatePlaceSchema.safeParse({ kind: 'office' }).success).toBe(true)
    expect(defaultPlaceSchema.safeParse({ placeId: null }).success).toBe(true)
    expect(defaultPlaceSchema.safeParse({ placeId: 'home' }).success).toBe(false)
  })
})

describe('packing templates and categories', () => {
  it('the requested categories all have a template (university, office, interview, business, travel, gym, personal outing)', () => {
    for (const key of ['university', 'office', 'interview', 'business', 'travel', 'gym', 'personal']) expect(CHECKLIST_TEMPLATES[key].items.length).toBeGreaterThan(0)
    expect(CHECKLIST_TEMPLATES.personal.label).toBe('Personal outing')
    expect(CHECKLIST_TEMPLATES.other.items).toEqual([])
  })
  it('events accept the new categories', () => {
    expect(EVENT_CATEGORIES).toEqual(expect.arrayContaining(['interview', 'business', 'gym']))
  })
  it('validates personal template bodies: items or fromEventId, bounded, no unknown fields', () => {
    expect(createPackingTemplateSchema.safeParse({ name: 'Gym bag', items: [{ text: 'Towel' }] }).success).toBe(true)
    expect(createPackingTemplateSchema.parse({ name: 'Gym bag', items: [{ text: 'Towel' }] }).items[0].group).toBe('Essentials')
    expect(createPackingTemplateSchema.safeParse({ name: 'x', fromEventId: '11111111-1111-4111-8111-111111111111' }).success).toBe(true)
    expect(createPackingTemplateSchema.safeParse({ name: 'x', items: [] }).success).toBe(false)
    expect(createPackingTemplateSchema.safeParse({ name: 'x', items: Array.from({ length: 101 }, (_, n) => ({ text: `i${n}` })) }).success).toBe(false)
    expect(createPackingTemplateSchema.safeParse({ name: 'x', items: [{ text: 'a', userId: 'z' }] }).success).toBe(false)
    expect(applyTemplateSchema.safeParse({ template: 'gym', personalTemplateId: '11111111-1111-4111-8111-111111111111' }).success).toBe(false)
  })
  it('dedupes by case-insensitive, whitespace-insensitive name and keeps order', () => {
    expect(textKeyOf('  Water   BOTTLE ')).toBe('water bottle')
    expect(dedupeItems([{ text: 'Keys' }, { text: 'keys ' }, { text: 'Wallet' }]).map((i) => i.text)).toEqual(['Keys', 'Wallet'])
  })
})

describe('error logging never leaks submitted values', () => {
  afterEach(() => vi.restoreAllMocks())
  it('a database (Prisma) error is logged by name and code only, not its message or stack', async () => {
    const { errorHandler } = await import('../src/middleware/error.middleware.js')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const secret = '12 Private Lane, Dhaka'
    const err = Object.assign(new Error(`Invalid value for argument address: ${secret}`), { name: 'PrismaClientValidationError', code: 'P2009' })
    const res = { status: () => ({ json: () => {} }) }
    errorHandler(err, {}, res, () => {})
    const logged = JSON.stringify(spy.mock.calls)
    expect(logged).toContain('PrismaClientValidationError')
    expect(logged).not.toContain('Private Lane')
  })
})
