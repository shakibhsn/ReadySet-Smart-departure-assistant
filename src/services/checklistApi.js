import { apiRequest } from '@/lib/apiClient'

const base = (eventId) => `/events/${encodeURIComponent(eventId)}/checklist`

export const CHECKLIST_GROUPS = ['Essentials', 'Documents', 'Electronics', 'Personal']

export const getChecklist = async (eventId) => (await apiRequest(base(eventId))).data
export const addChecklistItem = async (eventId, body) => (await apiRequest(base(eventId), { method: 'POST', body })).data.item
export const updateChecklistItem = async (eventId, itemId, body) => (await apiRequest(`${base(eventId)}/${encodeURIComponent(itemId)}`, { method: 'PATCH', body })).data.item
export const setChecklistItemDone = async (eventId, itemId, done) => (await apiRequest(`${base(eventId)}/${encodeURIComponent(itemId)}/completion`, { method: 'PATCH', body: { done } })).data.item
export const deleteChecklistItem = (eventId, itemId) => apiRequest(`${base(eventId)}/${encodeURIComponent(itemId)}`, { method: 'DELETE' })
/** `choice`: a built-in template key (string), `{ personalTemplateId }` for one of the user's own, or nothing (the event's category). */
export const applyChecklistTemplate = async (eventId, choice) => {
  const body = typeof choice === 'string' ? { template: choice } : choice?.personalTemplateId ? { personalTemplateId: choice.personalTemplateId } : {}
  return (await apiRequest(`${base(eventId)}/apply-template`, { method: 'POST', body })).data
}
export const getChecklistTemplates = async () => (await apiRequest('/checklist-templates')).data.templates
