import { prisma } from '../../config/database.js'
import { AppError } from '../../utils/apiResponse.js'
import { CHECKLIST_TEMPLATES } from './checklistTemplates.js'

// SECURITY (IDOR): userId always comes from the verified JWT. Every query filters by it, so knowing an
// event or item id is never enough to read or change someone else's checklist.

export const MAX_ITEMS_PER_EVENT = 100
const notFoundEvent = () => new AppError(404, 'Event not found')
const notFoundItem = () => new AppError(404, 'Checklist item not found')

const toPublic = (i) => ({ id: i.id, eventId: i.eventId, text: i.text, group: i.group, done: i.done, position: i.position, createdAt: i.createdAt.toISOString(), updatedAt: i.updatedAt.toISOString() })

export const progressOf = (items) => {
  const total = items.length
  const done = items.filter((i) => i.done).length
  return { total, done, remaining: total - done, percent: total ? Math.round((done / total) * 100) : 0 }
}

async function ownEvent(userId, eventId) {
  const event = await prisma.event.findFirst({ where: { id: eventId, userId }, select: { id: true, category: true } })
  if (!event) throw notFoundEvent()
  return event
}

const readItems = (userId, eventId) => prisma.checklistItem.findMany({ where: { userId, eventId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] })

async function view(userId, eventId) {
  const items = (await readItems(userId, eventId)).map(toPublic)
  return { items, progress: progressOf(items) }
}

export async function getChecklist(userId, eventId) {
  await ownEvent(userId, eventId)
  return view(userId, eventId)
}

async function nextPosition(userId, eventId) {
  const last = await prisma.checklistItem.aggregate({ where: { userId, eventId }, _max: { position: true } })
  return (last._max.position ?? -1) + 1
}

async function assertRoom(userId, eventId, adding) {
  const count = await prisma.checklistItem.count({ where: { userId, eventId } })
  if (count + adding > MAX_ITEMS_PER_EVENT) throw new AppError(409, `A checklist can have at most ${MAX_ITEMS_PER_EVENT} items`)
}

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()

export async function addItem(userId, eventId, { text, group }) {
  await ownEvent(userId, eventId)
  await assertRoom(userId, eventId, 1)
  const created = await prisma.checklistItem.create({ data: { userId, eventId, text, group, position: await nextPosition(userId, eventId) } })
  return toPublic(created)
}

export async function applyTemplate(userId, eventId, { template } = {}) {
  const event = await ownEvent(userId, eventId)
  const key = template ?? event.category
  const tpl = CHECKLIST_TEMPLATES[key]
  if (!tpl) throw new AppError(400, 'Validation failed', [{ field: 'template', message: 'Unknown template' }])
  const existing = await readItems(userId, eventId)
  const fresh = tpl.items.filter((t) => !existing.some((e) => sameName(e.text, t.text))) // duplicates are skipped
  if (fresh.length > 0) {
    await assertRoom(userId, eventId, fresh.length)
    const start = await nextPosition(userId, eventId)
    await prisma.checklistItem.createMany({ data: fresh.map((t, n) => ({ userId, eventId, text: t.text, group: t.group, position: start + n })) })
  }
  return { ...(await view(userId, eventId)), template: key, added: fresh.length, skipped: tpl.items.length - fresh.length }
}

export async function updateItem(userId, eventId, itemId, patch) {
  const result = await prisma.checklistItem.updateMany({ where: { id: itemId, eventId, userId }, data: patch })
  if (result.count === 0) throw notFoundItem()
  return toPublic(await prisma.checklistItem.findFirst({ where: { id: itemId, eventId, userId } }))
}

export const setCompletion = (userId, eventId, itemId, done) => updateItem(userId, eventId, itemId, { done })

export async function deleteItem(userId, eventId, itemId) {
  const result = await prisma.checklistItem.deleteMany({ where: { id: itemId, eventId, userId } })
  if (result.count === 0) throw notFoundItem()
}
