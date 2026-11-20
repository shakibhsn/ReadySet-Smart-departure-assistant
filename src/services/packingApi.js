import { apiRequest } from '@/lib/apiClient'

// ---- saved places (private: only ever the signed-in user's own) ----
export const getPlaces = async () => (await apiRequest('/places')).data
export const createPlace = async (body) => (await apiRequest('/places', { method: 'POST', body })).data.place
export const updatePlace = async (id, body) => (await apiRequest(`/places/${encodeURIComponent(id)}`, { method: 'PATCH', body })).data.place
export const deletePlace = (id) => apiRequest(`/places/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const setDefaultPlace = async (placeId) => (await apiRequest('/places/default', { method: 'PATCH', body: { placeId } })).data

// ---- personal packing templates ----
export const getPackingTemplates = async () => (await apiRequest('/packing-templates')).data.templates
export const createPackingTemplate = async (body) => (await apiRequest('/packing-templates', { method: 'POST', body })).data.template
export const deletePackingTemplate = (id) => apiRequest(`/packing-templates/${encodeURIComponent(id)}`, { method: 'DELETE' })

// ---- forgotten items (explicit "I forgot this" reports only) ----
export const getFrequentlyForgotten = async () => (await apiRequest('/packing/forgotten')).data.items
export const reportForgotten = async (eventId, itemId) => (await apiRequest(`/events/${encodeURIComponent(eventId)}/checklist/${encodeURIComponent(itemId)}/forgot`, { method: 'POST' })).data
