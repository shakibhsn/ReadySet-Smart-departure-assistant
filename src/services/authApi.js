import { apiRequest } from '@/lib/apiClient'

export const registerRequest = (form) => apiRequest('/auth/register', { method: 'POST', body: form, auth: false })
export const loginRequest = (credentials) => apiRequest('/auth/login', { method: 'POST', body: credentials, auth: false })
export const currentUserRequest = () => apiRequest('/auth/me')
export const logoutRequest = () => apiRequest('/auth/logout', { method: 'POST' })
