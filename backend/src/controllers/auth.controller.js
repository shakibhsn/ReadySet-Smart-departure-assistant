import * as authService from '../services/auth.service.js'
import { sendSuccess } from '../utils/apiResponse.js'

export async function register(req, res) {
  const { user, token } = await authService.registerUser(req.body)
  sendSuccess(res, 201, 'Account created successfully', { user, token })
}

export async function login(req, res) {
  const { user, token } = await authService.loginUser(req.body)
  sendSuccess(res, 200, 'Login successful', { user, token })
}

export async function me(req, res) {
  const user = await authService.getCurrentUser(req.userId)
  sendSuccess(res, 200, 'Current user retrieved', { user })
}

// JWTs are stateless: the server keeps no session, so it cannot revoke a token before it expires.
// Logging out means the client discards its token. This endpoint exists for a consistent API only.
export function logout(_req, res) {
  sendSuccess(res, 200, 'Logged out. Remove the token on the client; it remains valid until it expires.')
}
