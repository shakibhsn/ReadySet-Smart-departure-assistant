import { prisma } from '../config/database.js'
import { AppError } from '../utils/apiResponse.js'
import { CHECKLIST_TEMPLATES } from './checklist/checklistTemplates.js'

// Smart packing: the user's own templates, and "frequently forgotten" items.
// RULES
//  - An item is only ever counted as forgotten when the USER reports it ("I forgot this"). An unchecked item is not
//    evidence of anything, so nothing here looks at unchecked items.
//  - Every query filters by userId from the verified JWT.

export const MAX_PACKING_TEMPLATES = 30
export const MAX_TEMPLATE_ITEMS = 100
export const FORGOTTEN_WINDOW_DAYS = 180
export const FORGOTTEN_MIN_REPORTS = 2 // "frequently" = reported at least this many times in the window

const notFound = (what = 'Template') => new AppError(404, `${what} not found`)
export const textKeyOf = (text) => text.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120)
const today = (now) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

// ---------- personal packing templates ----------

export const toPublicPackingTemplate = (t) => ({ id: t.id, name: t.name, items: Array.isArray(t.items) ? t.items : [], createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })

/** Removes repeated names (case-insensitive) while keeping the first occurrence and the order. */
export function dedupeItems(items) {
  const seen = new Set()
  return items.filter((i) => !seen.has(textKeyOf(i.text)) && seen.add(textKeyOf(i.text)))
}

async function guard(fn) {
  try {
    return await fn()
  } catch (err) {
    if (err.code === 'P2002') throw new AppError(409, 'You already have a packing template with this name', [{ field: 'name', message: 'Name already used' }])
    throw err
  }
}

export async function listPackingTemplates(userId) {
  const rows = await prisma.packingTemplate.findMany({ where: { userId }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: MAX_PACKING_TEMPLATES })
  return { templates: rows.map(toPublicPackingTemplate) }
}

export async function createPackingTemplate(userId, { name, items, fromEventId }) {
  if ((await prisma.packingTemplate.count({ where: { userId } })) >= MAX_PACKING_TEMPLATES) throw new AppError(409, `You can save at most ${MAX_PACKING_TEMPLATES} packing templates`)
  let list = items
  if (fromEventId) {
    // Copy the checklist of one of MY events (404 for anyone else's).
    const event = await prisma.event.findFirst({ where: { id: fromEventId, userId }, select: { id: true } })
    if (!event) throw notFound('Event')
    list = (await prisma.checklistItem.findMany({ where: { userId, eventId: fromEventId }, orderBy: [{ position: 'asc' }, { id: 'asc' }], take: MAX_TEMPLATE_ITEMS })).map((i) => ({ text: i.text, group: i.group }))
    if (list.length === 0) throw new AppError(400, 'Validation failed', [{ field: 'fromEventId', message: 'This event has no checklist items to save' }])
  }
  const row = await guard(() => prisma.packingTemplate.create({ data: { userId, name, items: dedupeItems(list) } }))
  return { template: toPublicPackingTemplate(row) }
}

export async function updatePackingTemplate(userId, id, patch) {
  const data = { ...(patch.name !== undefined && { name: patch.name }), ...(patch.items !== undefined && { items: dedupeItems(patch.items) }) }
  const result = await guard(() => prisma.packingTemplate.updateMany({ where: { id, userId }, data }))
  if (result.count === 0) throw notFound()
  return { template: toPublicPackingTemplate(await prisma.packingTemplate.findFirst({ where: { id, userId } })) }
}

export async function deletePackingTemplate(userId, id) {
  const result = await prisma.packingTemplate.deleteMany({ where: { id, userId } })
  if (result.count === 0) throw notFound()
}

// ---------- "I forgot this" ----------

export async function reportForgotten(userId, eventId, itemId, now = new Date()) {
  const item = await prisma.checklistItem.findFirst({ where: { id: itemId, eventId, userId }, select: { text: true } })
  if (!item) throw notFound('Checklist item')
  const result = await prisma.forgottenItemReport.createMany({
    data: [{ userId, eventId, itemText: item.text.slice(0, 120), textKey: textKeyOf(item.text), reportedOn: today(now) }],
    skipDuplicates: true, // one report per item per event per day: repeating the request changes nothing
  })
  return { reported: result.count > 0, alreadyReported: result.count === 0 }
}

/** Undo today's report for this item (a mis-click). */
export async function undoForgotten(userId, eventId, itemId, now = new Date()) {
  const item = await prisma.checklistItem.findFirst({ where: { id: itemId, eventId, userId }, select: { text: true } })
  if (!item) throw notFound('Checklist item')
  const result = await prisma.forgottenItemReport.deleteMany({ where: { userId, eventId, textKey: textKeyOf(item.text), reportedOn: today(now) } })
  return { removed: result.count > 0 }
}

/** Items the user reported forgotten at least FORGOTTEN_MIN_REPORTS times in the last 180 days. */
export async function frequentlyForgotten(userId, now = new Date(), { limit = 20 } = {}) {
  const since = new Date(today(now).getTime() - FORGOTTEN_WINDOW_DAYS * 86_400_000)
  const groups = await prisma.forgottenItemReport.groupBy({
    by: ['textKey'],
    where: { userId, reportedOn: { gte: since } },
    _count: { _all: true },
    _max: { reportedOn: true },
    having: { textKey: { _count: { gte: FORGOTTEN_MIN_REPORTS } } },
    orderBy: [{ _count: { textKey: 'desc' } }, { textKey: 'asc' }],
    take: limit,
  })
  if (groups.length === 0) return []
  const names = await prisma.forgottenItemReport.findMany({ where: { userId, textKey: { in: groups.map((g) => g.textKey) } }, orderBy: { createdAt: 'desc' }, distinct: ['textKey'], select: { textKey: true, itemText: true } })
  const display = new Map(names.map((n) => [n.textKey, n.itemText]))
  return groups.map((g) => ({ text: display.get(g.textKey) ?? g.textKey, reports: g._count._all, lastReportedOn: g._max.reportedOn.toISOString().slice(0, 10) }))
}

/** Built-in suggestions for a category plus the user's frequently forgotten items (shown as suggestions only). */
export async function suggestionsFor(userId, category, now = new Date()) {
  const tpl = CHECKLIST_TEMPLATES[category]
  return {
    category,
    label: tpl.label,
    items: tpl.items,
    oftenForgotten: await frequentlyForgotten(userId, now),
    note: 'Often-forgotten items come only from items you reported as forgotten. They are suggestions and are never added automatically.',
  }
}
