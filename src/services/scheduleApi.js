import { apiRequest } from '@/lib/apiClient'
import { queryString } from '@/lib/queryString'

const ev = (id) => `/events/${encodeURIComponent(id)}`

// ---- one occurrence of a recurring event ----
export const skipOccurrence = async (eventId, originalStart) => (await apiRequest(`${ev(eventId)}/occurrences/skip`, { method: 'POST', body: { originalStart } })).data
export const overrideOccurrence = async (eventId, body) => (await apiRequest(`${ev(eventId)}/occurrences`, { method: 'PATCH', body })).data
export const restoreOccurrence = async (eventId, originalStart) => (await apiRequest(`${ev(eventId)}/occurrences/restore`, { method: 'POST', body: { originalStart } })).data

// ---- templates ----
export const getEventTemplates = async () => (await apiRequest('/event-templates')).data.templates
export const createEventTemplate = async (body) => (await apiRequest('/event-templates', { method: 'POST', body })).data.template
export const deleteEventTemplate = (id) => apiRequest(`/event-templates/${encodeURIComponent(id)}`, { method: 'DELETE' })

// ---- conflicts (read-only analysis computed by the backend) ----
export const getConflicts = async (params) => (await apiRequest(`/schedule/conflicts${queryString(params)}`)).data
