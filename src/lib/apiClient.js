import { getToken } from './tokenStorage'

// The only place the backend URL is configured (see .env.example).
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4100/api').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, { status = 0, errors = [], isNetworkError = false, code = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
    this.isNetworkError = isNetworkError
    this.code = code // machine-readable reason from the backend, e.g. TOKEN_EXPIRED, EMAIL_NOT_VERIFIED
  }
}

let unauthorizedHandler = null
/** Called when an authenticated request comes back 401 (expired / invalid token). */
export const setUnauthorizedHandler = (fn) => {
  unauthorizedHandler = fn
}

/** Maps backend validation errors ([{ field, message }]) to { field: message } for forms. */
export const fieldErrorsFrom = (error) =>
  Object.fromEntries((error?.errors ?? []).filter((e) => e.field).map((e) => [e.field, e.message]))

export async function apiRequest(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = auth ? getToken() : null
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', { isNetworkError: true })
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401 && token) unauthorizedHandler?.()
    throw new ApiError(payload?.message ?? 'Something went wrong. Please try again.', {
      status: response.status,
      errors: payload?.errors ?? [],
      code: payload?.code ?? null,
    })
  }
  return payload
}
