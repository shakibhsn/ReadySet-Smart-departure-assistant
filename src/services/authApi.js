import { apiRequest } from '@/lib/apiClient'

export const registerRequest = (form) => apiRequest('/auth/register', { method: 'POST', body: form, auth: false })
export const loginRequest = (credentials) => apiRequest('/auth/login', { method: 'POST', body: credentials, auth: false })
export const currentUserRequest = () => apiRequest('/auth/me')
export const logoutRequest = () => apiRequest('/auth/logout', { method: 'POST' })

// Email flows. The backend answers forgot-password / resend-verification identically for known and
// unknown addresses, so the UI must not imply that an account exists.
export const verifyEmailRequest = (token) => apiRequest('/auth/verify-email', { method: 'POST', body: { token }, auth: false })
export const resendVerificationRequest = (email) => apiRequest('/auth/resend-verification', { method: 'POST', body: { email }, auth: false })
export const forgotPasswordRequest = (email) => apiRequest('/auth/forgot-password', { method: 'POST', body: { email }, auth: false })
export const resetPasswordRequest = (payload) => apiRequest('/auth/reset-password', { method: 'POST', body: payload, auth: false })
export const confirmEmailChangeRequest = (token) => apiRequest('/auth/confirm-email-change', { method: 'POST', body: { token }, auth: false })
