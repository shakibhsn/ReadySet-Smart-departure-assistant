import * as accountEmail from '../services/accountEmail.service.js'
import * as authService from '../services/auth.service.js'
import { sendSuccess } from '../utils/apiResponse.js'

export async function register(req, res) {
  const { user, token, verificationRequired } = await authService.registerUser(req.body)
  const message = verificationRequired
    ? 'Account created. Check your email to verify your address before logging in.'
    : 'Account created successfully'
  // token is null when verification is mandatory: the user must verify before getting a session.
  sendSuccess(res, 201, message, { user, token, verificationRequired })
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

export async function verifyEmail(req, res) {
  await accountEmail.verifyEmail(req.body.token)
  sendSuccess(res, 200, 'Your email address has been verified.')
}

// Identical response whether or not the address exists (no account enumeration).
export async function resendVerification(req, res) {
  await accountEmail.resendVerification(req.body.email)
  sendSuccess(res, 200, 'If that address belongs to an account that still needs verification, we have sent a new link.')
}

export async function forgotPassword(req, res) {
  await accountEmail.requestPasswordReset(req.body.email)
  sendSuccess(res, 200, 'If an account exists for that address, we have sent a password reset link.')
}

export async function resetPassword(req, res) {
  await accountEmail.resetPassword(req.body.token, req.body.password)
  sendSuccess(res, 200, 'Your password has been changed. Please log in with your new password.')
}

export async function confirmEmailChange(req, res) {
  await accountEmail.confirmEmailChange(req.body.token)
  sendSuccess(res, 200, 'Your email address has been changed. Please log in again.')
}
