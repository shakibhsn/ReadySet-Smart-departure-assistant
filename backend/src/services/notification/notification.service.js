import { prisma, supportsField } from '../../config/database.js'
import { AppError } from '../../utils/apiResponse.js'
import { isSnoozed, priorityFor, snoozeUntil, typesWithPriority } from './notificationRules.js'

// SECURITY (IDOR): userId always comes from the verified JWT and is part of EVERY query below, so a
// notification id alone never lets anyone read, change or delete another user's notification.

const notFound = () => new AppError(404, 'Notification not found')

// Snooze needs the migrated column AND a regenerated client; until then it is simply absent (never an error).
export const snoozeSupported = () => supportsField('Notification', 'snoozedUntil')
const notSnoozed = (now) => (snoozeSupported() ? { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] } : {})

const toPublic = (n, now = new Date()) => ({
  id: n.id,
  eventId: n.eventId,
  type: n.type,
  category: n.category,
  priority: priorityFor(n.type),
  snoozedUntil: isSnoozed(n.snoozedUntil, now) ? n.snoozedUntil.toISOString() : null,
  title: n.title,
  body: n.body,
  read: n.readAt !== null,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
})

export const countUnread = (userId, now = new Date()) => prisma.notification.count({ where: { userId, readAt: null, ...notSnoozed(now) } })

export async function listNotifications(userId, { status = 'all', category, priority, page = 1, limit = 20 } = {}, now = new Date()) {
  // 'unread' hides snoozed ones; 'snoozed' lists only those; 'all' / 'read' is the full history.
  const where = {
    userId,
    ...(status === 'unread' && { readAt: null, ...notSnoozed(now) }),
    ...(status === 'read' && { readAt: { not: null } }),
    ...(status === 'snoozed' && (snoozeSupported() ? { readAt: null, snoozedUntil: { gt: now } } : { id: { in: [] } })),
    ...(category && { category }),
    ...(priority && { type: { in: typesWithPriority(priority) } }),
  }
  const [rows, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
    prisma.notification.count({ where }),
    countUnread(userId, now),
  ])
  return { notifications: rows.map((r) => toPublic(r, now)), unreadCount, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

export async function markRead(userId, id) {
  await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } }) // idempotent: keeps the first read time
  const row = await prisma.notification.findFirst({ where: { id, userId } })
  if (!row) throw notFound()
  return { notification: toPublic(row), unreadCount: await countUnread(userId) }
}

export async function markAllRead(userId) {
  const result = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })
  return { updated: result.count, unreadCount: 0 }
}

export async function removeNotification(userId, id) {
  const result = await prisma.notification.deleteMany({ where: { id, userId } })
  if (result.count === 0) throw notFound()
  return { unreadCount: await countUnread(userId) }
}

/**
 * Called when an event's schedule changes (time, timezone, durations, recurrence): its UNREAD reminders were
 * built from the old schedule, so they are removed and the next sweep creates correct ones. Read ones stay as history.
 */
export const invalidateEventReminders = (userId, eventId) => prisma.notification.deleteMany({ where: { userId, eventId, readAt: null } })

// ---------- preferences (stored on the user's preference row) ----------

const prefSelect = { notificationsEnabled: true, notifyUpcoming: true, notifyPrep: true, notifyDeparture: true, notifyChecklist: true, notificationLeadMinutes: true, browserNotificationsEnabled: true }

const toPrefs = (p) => ({
  enabled: p.notificationsEnabled,
  upcoming: p.notifyUpcoming,
  prep: p.notifyPrep,
  departure: p.notifyDeparture,
  checklist: p.notifyChecklist,
  leadMinutes: p.notificationLeadMinutes,
  browser: p.browserNotificationsEnabled,
})

export async function getPreferences(userId) {
  const pref = await prisma.userPreference.findUnique({ where: { userId }, select: prefSelect })
  if (!pref) throw new AppError(404, 'Preferences not found')
  return toPrefs(pref)
}

export async function updatePreferences(userId, input) {
  const map = { enabled: 'notificationsEnabled', upcoming: 'notifyUpcoming', prep: 'notifyPrep', departure: 'notifyDeparture', checklist: 'notifyChecklist', leadMinutes: 'notificationLeadMinutes', browser: 'browserNotificationsEnabled' }
  const data = Object.fromEntries(Object.entries(map).filter(([k]) => input[k] !== undefined).map(([k, column]) => [column, input[k]]))
  try {
    return toPrefs(await prisma.userPreference.update({ where: { userId }, data, select: prefSelect }))
  } catch (err) {
    if (err.code === 'P2025') throw new AppError(404, 'Preferences not found')
    throw err
  }
}

// ---------- snooze ----------

/** Hides one UNREAD notification until the chosen time (never past its event's start). userId is part of the query: no IDOR. */
export async function snoozeNotification(userId, id, choice, now = new Date()) {
  if (!snoozeSupported()) throw new AppError(503, 'Snooze is not available yet: the database update has not been applied')
  const row = await prisma.notification.findFirst({ where: { id, userId } })
  if (!row) throw notFound()
  if (row.readAt) throw new AppError(409, 'Only unread notifications can be snoozed')
  const result = snoozeUntil(choice, { now, occurrenceStart: row.occurrenceStart })
  if (result.error) throw new AppError(400, 'Validation failed', [{ field: 'choice', message: result.error }])
  await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { snoozedUntil: result.until } })
  return { notification: toPublic({ ...row, snoozedUntil: result.until }, now), unreadCount: await countUnread(userId, now) }
}

export async function unsnoozeNotification(userId, id, now = new Date()) {
  if (!snoozeSupported()) throw new AppError(503, 'Snooze is not available yet: the database update has not been applied')
  const result = await prisma.notification.updateMany({ where: { id, userId }, data: { snoozedUntil: null } })
  if (result.count === 0) throw notFound()
  return { notification: toPublic(await prisma.notification.findFirst({ where: { id, userId } }), now), unreadCount: await countUnread(userId, now) }
}
