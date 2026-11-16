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

// Bumps the user's tokenVersion, so every token issued before now (on every device) stops working.
// The client must also discard its copy.
export async function logout(req, res) {
  await authService.revokeUserTokens(req.userId)
  sendSuccess(res, 200, 'Logged out. All existing sessions for this account have been invalidated.')
}
