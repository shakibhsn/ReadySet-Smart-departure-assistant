import { apiRequest } from '@/lib/apiClient'

const base = (eventId) => `/events/${encodeURIComponent(eventId)}/checklist`

export const CHECKLIST_GROUPS = ['Essentials', 'Documents', 'Electronics', 'Personal']

export const getChecklist = async (eventId) => (await apiRequest(base(eventId))).data
export const addChecklistItem = async (eventId, body) => (await apiRequest(base(eventId), { method: 'POST', body })).data.item
export const updateChecklistItem = async (eventId, itemId, body) => (await apiRequest(`${base(eventId)}/${encodeURIComponent(itemId)}`, { method: 'PATCH', body })).data.item
export const setChecklistItemDone = async (eventId, itemId, done) => (await apiRequest(`${base(eventId)}/${encodeURIComponent(itemId)}/completion`, { method: 'PATCH', body: { done } })).data.item
export const deleteChecklistItem = (eventId, itemId) => apiRequest(`${base(eventId)}/${encodeURIComponent(itemId)}`, { method: 'DELETE' })
export const applyChecklistTemplate = async (eventId, template) => (await apiRequest(`${base(eventId)}/apply-template`, { method: 'POST', body: template ? { template } : {} })).data
export const getChecklistTemplates = async () => (await apiRequest('/checklist-templates')).data.templates
