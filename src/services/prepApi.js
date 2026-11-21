import { apiRequest } from '@/lib/apiClient'
import { queryString } from '@/lib/queryString'

// Tap-to-log: the client only says WHICH action happened; the server writes every timestamp.
export const getPrepState = async (eventId, params) => (await apiRequest(`/events/${encodeURIComponent(eventId)}/prep-log${queryString(params)}`)).data
export const logPrepAction = async (eventId, action) => (await apiRequest(`/events/${encodeURIComponent(eventId)}/prep-log`, { method: 'POST', body: { action } })).data

export const getPrepProfile = async () => (await apiRequest('/prep-profile')).data
export const getPrepLogs = async () => (await apiRequest('/prep-profile/logs')).data.logs
export const deletePrepLog = (id) => apiRequest(`/prep-profile/logs/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const erasePrepData = async () => (await apiRequest('/prep-profile/data', { method: 'DELETE' })).data
export const setProfileEnabled = async (enabled) => (await apiRequest('/prep-profile/settings', { method: 'PATCH', body: { enabled } })).data
export const saveOverride = async (body) => (await apiRequest('/prep-profile/overrides', { method: 'PUT', body })).data
export const clearOverride = async (category) => (await apiRequest(`/prep-profile/overrides/${encodeURIComponent(category)}`, { method: 'DELETE' })).data
