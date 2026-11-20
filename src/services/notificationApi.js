import { apiRequest } from '@/lib/apiClient'
import { queryString } from '@/lib/queryString'

export const getNotifications = async (params) => (await apiRequest(`/notifications${queryString(params)}`)).data
export const markNotificationRead = async (id) => (await apiRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' })).data
export const markAllNotificationsRead = async () => (await apiRequest('/notifications/read-all', { method: 'POST' })).data
export const deleteNotification = async (id) => (await apiRequest(`/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' })).data

export const getNotificationPreferences = async () => (await apiRequest('/users/me/notification-preferences')).data.preferences
export const updateNotificationPreferences = async (patch) => (await apiRequest('/users/me/notification-preferences', { method: 'PATCH', body: patch })).data.preferences
