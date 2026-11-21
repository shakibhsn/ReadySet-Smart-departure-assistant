import { apiRequest } from '@/lib/apiClient'
import { offlineStore } from '@/lib/offline/offlineStore'
import { getOfflineUser } from '@/lib/offline/offlineUser'
import { getProgress } from '@/utils/events'

const base = (eventId) => `/events/${encodeURIComponent(eventId)}/checklist`

export const CHECKLIST_GROUPS = ['Essentials', 'Documents', 'Electronics', 'Personal']

/**
 * OFFLINE: a successful load is copied to this device (per user). If the server cannot be reached the saved copy is
 * returned, marked offline. Only network failures fall back; a 401/403/404 is always shown as the real error.
 */
export const getChecklist = async (eventId) => {
  const userId = getOfflineUser()
  try {
    const data = (await apiRequest(base(eventId))).data
    if (userId) offlineStore.saveChecklist(userId, eventId, data)
    return data
  } catch (error) {
    if (error?.isNetworkError && userId) {
      const saved = await offlineStore.loadChecklist(userId, eventId)
      if (saved) return { items: saved.items, progress: saved.progress, offline: true, savedAt: saved.savedAt }
    }
    throw error
  }
}
export const addChecklistItem = async (eventId, body) => (await apiRequest(base(eventId), { method: 'POST', body })).data.item
export const updateChecklistItem = async (eventId, itemId, body) => (await apiRequest(`${base(eventId)}/${encodeURIComponent(itemId)}`, { method: 'PATCH', body })).data.item
/**
 * OFFLINE: if the server cannot be reached, the tick is kept on this device (queue + saved copy) and synced later.
 * baseUpdatedAt is the item's server version as the user last saw it, so a change made elsewhere is never overwritten.
 */
/** The plain request, with NO offline fallback: used by the sync queue itself. */
export const setChecklistItemDoneOnline = async (eventId, itemId, done, baseUpdatedAt) =>
  (await apiRequest(`${base(eventId)}/${encodeURIComponent(itemId)}/completion`, { method: 'PATCH', body: { done, ...(baseUpdatedAt && { baseUpdatedAt }) } })).data.item

export const setChecklistItemDone = async (eventId, itemId, done, baseUpdatedAt) => {
  try {
    return (await apiRequest(`${base(eventId)}/${encodeURIComponent(itemId)}/completion`, { method: 'PATCH', body: { done, ...(baseUpdatedAt && { baseUpdatedAt }) } })).data.item
  } catch (error) {
    const userId = getOfflineUser()
    if (!error?.isNetworkError || !userId) throw error
    const saved = await offlineStore.loadChecklist(userId, eventId)
    const item = saved?.items.find((i) => i.id === itemId)
    if (!item) throw error // nothing saved for this item: it cannot be changed offline
    const op = await offlineStore.enqueueCompletion({ opId: crypto.randomUUID(), userId, eventId, itemId, done, baseUpdatedAt: item.updatedAt })
    if (!op) throw error
    const items = saved.items.map((i) => (i.id === itemId ? { ...i, done } : i)) // updatedAt stays the SERVER's, it is the conflict base
    await offlineStore.saveChecklist(userId, eventId, { items, progress: getProgress(items) })
    return { ...item, done, pendingSync: true }
  }
}
export const deleteChecklistItem = (eventId, itemId) => apiRequest(`${base(eventId)}/${encodeURIComponent(itemId)}`, { method: 'DELETE' })
/** `choice`: a built-in template key (string), `{ personalTemplateId }` for one of the user's own, or nothing (the event's category). */
export const applyChecklistTemplate = async (eventId, choice) => {
  const body = typeof choice === 'string' ? { template: choice } : choice?.personalTemplateId ? { personalTemplateId: choice.personalTemplateId } : {}
  return (await apiRequest(`${base(eventId)}/apply-template`, { method: 'POST', body })).data
}
export const getChecklistTemplates = async () => (await apiRequest('/checklist-templates')).data.templates
