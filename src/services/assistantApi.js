import { apiRequest } from '@/lib/apiClient'

/** Read-only question. `eventId` is only used to answer a "which event?" follow-up. */
export const askAssistant = async (question, eventId) => (await apiRequest('/assistant/ask', { method: 'POST', body: { question, ...(eventId && { eventId }) } })).data

/** Applies ONE proposal the user explicitly accepted (the token was issued by the server with the proposal). */
export const confirmAssistantAction = async (token) => (await apiRequest('/assistant/confirm', { method: 'POST', body: { token } })).data
