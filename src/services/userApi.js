import { apiRequest } from '@/lib/apiClient'

export const updateProfileRequest = (data) => apiRequest('/users/me', { method: 'PATCH', body: data })
export const updatePreferencesRequest = (data) => apiRequest('/users/me/preferences', { method: 'PATCH', body: data })

export const getEmailPreferencesRequest = async () => (await apiRequest('/users/me/email-preferences')).data.preferences
export const updateEmailPreferencesRequest = async (data) =>
  (await apiRequest('/users/me/email-preferences', { method: 'PATCH', body: data })).data.preferences

/** Starts an email change. The address only changes after the NEW address confirms the emailed link. */
export const requestEmailChangeRequest = (newEmail, password) =>
  apiRequest('/users/me/email-change', { method: 'POST', body: { newEmail, password } })
