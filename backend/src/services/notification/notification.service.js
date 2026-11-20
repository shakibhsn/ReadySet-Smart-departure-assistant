import { prisma } from '../../config/database.js'
import { AppError } from '../../utils/apiResponse.js'

// SECURITY (IDOR): userId always comes from the verified JWT and is part of EVERY query below, so a
// notification id alone never lets anyone read, change or delete another user's notification.

const notFound = () => new AppError(404, 'Notification not found')

const toPublic = (n) => ({
  id: n.id,
  eventId: n.eventId,
  type: n.type,
  category: n.category,
  title: n.title,
  body: n.body,
  read: n.readAt !== null,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
})

export const countUnread = (userId) => prisma.notification.count({ where: { userId, readAt: null } })

export async function listNotifications(userId, { status = 'all', category, page = 1, limit = 20 } = {}) {
  const where = { userId, ...(status === 'unread' && { readAt: null }), ...(status === 'read' && { readAt: { not: null } }), ...(category && { category }) }
  const [rows, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
    prisma.notification.count({ where }),
    countUnread(userId),
  ])
  return { notifications: rows.map(toPublic), unreadCount, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
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
