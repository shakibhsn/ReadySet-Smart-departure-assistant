import { prisma } from '../config/database.js'
import { AppError } from '../utils/apiResponse.js'
import { createEvent } from './event.service.js'

// Reusable event templates. A template has no date: the date/time is chosen when it is used.
// SECURITY: every query filters by userId from the verified JWT.

export const MAX_TEMPLATES = 50
const notFound = () => new AppError(404, 'Template not found')

export const toPublicTemplate = (t) => ({
  id: t.id, name: t.name, title: t.title, category: t.category, destination: t.destination, notes: t.notes, timezone: t.timezone,
  travelDurationMinutes: t.travelDurationMinutes, preparationMinutes: t.preparationMinutes, arrivalBufferMinutes: t.arrivalBufferMinutes,
  durationMinutes: t.durationMinutes, recurrence: t.recurrence ?? null, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(),
})

/** The repeat pattern of an event, without any absolute end date (a template has no start date to be relative to). */
const patternOf = (rule) => (rule ? { frequency: rule.frequency, interval: rule.interval, ...(rule.frequency === 'WEEKLY' && { daysOfWeek: rule.daysOfWeek }), ...(rule.occurrenceCount && { count: rule.occurrenceCount }) } : null)

async function guard(fn) {
  try {
    return await fn()
  } catch (err) {
    if (err.code === 'P2002') throw new AppError(409, 'You already have a template with this name', [{ field: 'name', message: 'Name already used' }])
    throw err
  }
}

export const listTemplates = async (userId) => ({ templates: (await prisma.eventTemplate.findMany({ where: { userId }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: MAX_TEMPLATES })).map(toPublicTemplate) })

export async function createTemplate(userId, input) {
  if ((await prisma.eventTemplate.count({ where: { userId } })) >= MAX_TEMPLATES) throw new AppError(409, `You can save at most ${MAX_TEMPLATES} templates`)
  let data = input
  if (input.fromEventId) {
    // Copy from one of MY events (404 for anyone else's).
    const event = await prisma.event.findFirst({ where: { id: input.fromEventId, userId }, include: { recurrenceRule: true } })
    if (!event) throw new AppError(404, 'Event not found')
    data = {
      name: input.name, title: event.title, category: event.category, destination: event.destination, notes: event.notes, timezone: event.timezone,
      travelDurationMinutes: event.travelDurationMinutes, preparationMinutes: event.preparationMinutes, arrivalBufferMinutes: event.arrivalBufferMinutes,
      durationMinutes: event.durationMinutes, recurrence: patternOf(event.recurrenceRule),
    }
  }
  const { fromEventId: _ignored, ...fields } = data
  const row = await guard(() => prisma.eventTemplate.create({ data: { userId, ...fields, destination: fields.destination ?? null, notes: fields.notes ?? null, timezone: fields.timezone ?? null, durationMinutes: fields.durationMinutes ?? null, recurrence: fields.recurrence ?? undefined } }))
  return { template: toPublicTemplate(row) }
}

export async function updateTemplate(userId, id, patch) {
  const result = await guard(() => prisma.eventTemplate.updateMany({ where: { id, userId }, data: { ...patch, ...(patch.recurrence === null && { recurrence: null }) } }))
  if (result.count === 0) throw notFound()
  return { template: toPublicTemplate(await prisma.eventTemplate.findFirst({ where: { id, userId } })) }
}

export async function deleteTemplate(userId, id) {
  const result = await prisma.eventTemplate.deleteMany({ where: { id, userId } })
  if (result.count === 0) throw notFound()
}

/** Creates a REAL event from a template, through the normal createEvent path (same validation, same engine). */
export async function createEventFromTemplate(userId, id, { startAt, timezone }) {
  const t = await prisma.eventTemplate.findFirst({ where: { id, userId } })
  if (!t) throw notFound()
  const event = await createEvent(userId, {
    title: t.title, category: t.category, startAt, timezone: timezone ?? t.timezone ?? undefined, destination: t.destination, notes: t.notes,
    travelDurationMinutes: t.travelDurationMinutes, preparationMinutes: t.preparationMinutes, arrivalBufferMinutes: t.arrivalBufferMinutes,
    durationMinutes: t.durationMinutes, recurrence: t.recurrence ?? null,
  })
  return { event }
}
