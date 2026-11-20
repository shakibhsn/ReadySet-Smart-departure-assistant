import { prisma } from '../config/database.js'
import { AppError } from '../utils/apiResponse.js'
import { parseStart } from '../utils/timezone.js'
import { toPublicEvent } from './event.service.js'
import { invalidateEventReminders } from './notification/notification.service.js'
import { MAX_SHIFT_DAYS, findOccurrence, isGeneratedOccurrence } from './occurrence.js'

// Skip / edit ONE occurrence of a recurring event, or restore it. The series is never copied: each change is one row
// in event_exceptions, UNIQUE per (event, original occurrence), so repeating a request updates the same row (idempotent).
// SECURITY: every query filters by userId from the verified JWT.

export const MAX_EXCEPTIONS_PER_EVENT = 200
const fieldError = (field, message) => new AppError(400, 'Validation failed', [{ field, message }])
const OVERRIDE_FIELDS = ['title', 'destination', 'notes', 'travelDurationMinutes', 'preparationMinutes', 'arrivalBufferMinutes', 'durationMinutes']

async function ownRecurring(userId, eventId) {
  const event = await prisma.event.findFirst({ where: { id: eventId, userId }, include: { recurrenceRule: true, exceptions: true } })
  if (!event) throw new AppError(404, 'Event not found')
  if (!event.isRecurring) throw new AppError(400, 'Only recurring events have occurrences. Edit or delete the event instead.')
  return event
}

function requireGenerated(event, originalStart) {
  const instant = new Date(originalStart)
  if (!isGeneratedOccurrence(event, instant)) throw fieldError('originalStart', 'Not an occurrence of this event')
  return instant
}

async function assertRoom(event, instant) {
  const exists = event.exceptions.some((e) => e.originalStart.getTime() === instant.getTime())
  if (!exists && event.exceptions.length >= MAX_EXCEPTIONS_PER_EVENT) throw new AppError(409, `A series can have at most ${MAX_EXCEPTIONS_PER_EVENT} changed or skipped occurrences`)
}

const cleared = Object.fromEntries([...OVERRIDE_FIELDS, 'startAt'].map((f) => [f, null]))

export async function skipOccurrence(userId, eventId, { originalStart }) {
  const event = await ownRecurring(userId, eventId)
  const instant = requireGenerated(event, originalStart)
  await assertRoom(event, instant)
  await prisma.eventException.upsert({
    where: { eventId_originalStart: { eventId, originalStart: instant } },
    create: { userId, eventId, originalStart: instant, kind: 'SKIPPED' },
    update: { kind: 'SKIPPED', ...cleared },
  })
  await invalidateEventReminders(userId, eventId) // unread reminders for the old schedule are stale now
  return { skipped: true, originalStart: instant.toISOString() }
}

export async function overrideOccurrence(userId, eventId, input) {
  const event = await ownRecurring(userId, eventId)
  const instant = requireGenerated(event, input.originalStart)
  await assertRoom(event, instant)

  let startAt = null
  if (input.startAt !== undefined) {
    const parsed = parseStart(input.startAt, event.timezone)
    if (!parsed) throw fieldError('startAt', 'Not a valid date and time')
    startAt = parsed.toJSDate()
    if (Math.abs(startAt.getTime() - instant.getTime()) > MAX_SHIFT_DAYS * 86_400_000) throw fieldError('startAt', `An occurrence can only be moved by up to ${MAX_SHIFT_DAYS} days. Edit the whole series for bigger changes.`)
  }
  // Full-replace semantics: omitted values return to the series value.
  const data = { kind: 'OVERRIDDEN', startAt, ...Object.fromEntries(OVERRIDE_FIELDS.map((f) => [f, input[f] ?? null])) }
  await prisma.eventException.upsert({
    where: { eventId_originalStart: { eventId, originalStart: instant } },
    create: { userId, eventId, originalStart: instant, ...data },
    update: data,
  })
  await invalidateEventReminders(userId, eventId)

  const fresh = await prisma.event.findFirst({ where: { id: eventId, userId }, include: { recurrenceRule: true, exceptions: true } })
  const occ = findOccurrence(fresh, startAt ?? instant)
  return { occurrence: occ ? toPublicEvent(occ.event, occ.at, { originalStart: occ.originalStart, modified: occ.modified }) : null }
}

export async function restoreOccurrence(userId, eventId, { originalStart }) {
  const event = await ownRecurring(userId, eventId)
  const instant = requireGenerated(event, originalStart)
  const result = await prisma.eventException.deleteMany({ where: { eventId, userId, originalStart: instant } })
  if (result.count > 0) await invalidateEventReminders(userId, eventId)
  return { restored: result.count > 0, originalStart: instant.toISOString() }
}

export async function listExceptions(userId, eventId) {
  const event = await ownRecurring(userId, eventId)
  const rows = [...event.exceptions].sort((a, b) => a.originalStart - b.originalStart)
  return {
    exceptions: rows.map((e) => ({ originalStart: e.originalStart.toISOString(), kind: e.kind, startAt: e.startAt?.toISOString() ?? null, ...Object.fromEntries(OVERRIDE_FIELDS.map((f) => [f, e[f]])) })),
  }
}
