import * as service from '../services/notification/notification.service.js'
import { sendSuccess } from '../utils/apiResponse.js'

// userId is ALWAYS req.userId (from the verified JWT), never from the request.

export async function list(req, res) {
  sendSuccess(res, 200, 'Notifications retrieved', await service.listNotifications(req.userId, req.validated.query))
}
export async function unreadCount(req, res) {
  sendSuccess(res, 200, 'Unread count retrieved', { unreadCount: await service.countUnread(req.userId) })
}
export async function read(req, res) {
  sendSuccess(res, 200, 'Notification marked as read', await service.markRead(req.userId, req.validated.params.id))
}
export async function readAll(req, res) {
  sendSuccess(res, 200, 'All notifications marked as read', await service.markAllRead(req.userId))
}
export async function remove(req, res) {
  sendSuccess(res, 200, 'Notification deleted', await service.removeNotification(req.userId, req.validated.params.id))
}
export async function getPreferences(req, res) {
  sendSuccess(res, 200, 'Notification preferences retrieved', { preferences: await service.getPreferences(req.userId) })
}
export async function updatePreferences(req, res) {
  sendSuccess(res, 200, 'Notification preferences updated', { preferences: await service.updatePreferences(req.userId, req.body) })
}
export async function snooze(req, res) {
  sendSuccess(res, 200, 'Notification snoozed', await service.snoozeNotification(req.userId, req.validated.params.id, req.body.choice))
}
export async function unsnooze(req, res) {
  sendSuccess(res, 200, 'Snooze cleared', await service.unsnoozeNotification(req.userId, req.validated.params.id))
}
