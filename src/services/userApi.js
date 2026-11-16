import { apiRequest } from '@/lib/apiClient'

export const updateProfileRequest = (data) => apiRequest('/users/me', { method: 'PATCH', body: data })
export const updatePreferencesRequest = (data) => apiRequest('/users/me/preferences', { method: 'PATCH', body: data })
