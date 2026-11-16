import * as accountEmail from '../services/accountEmail.service.js'
import * as userService from '../services/user.service.js'
import { sendSuccess } from '../utils/apiResponse.js'

export async function getMe(req, res) {
  sendSuccess(res, 200, 'Profile retrieved', { user: await userService.getProfile(req.userId) })
}

export async function updateMe(req, res) {
  sendSuccess(res, 200, 'Profile updated', { user: await userService.updateProfile(req.userId, req.body) })
}

export async function getMyPreferences(req, res) {
  sendSuccess(res, 200, 'Preferences retrieved', { preferences: await userService.getPreferences(req.userId) })
}

export async function updateMyPreferences(req, res) {
  sendSuccess(res, 200, 'Preferences updated', { preferences: await userService.updatePreferences(req.userId, req.body) })
}

export async function getMyEmailPreferences(req, res) {
  sendSuccess(res, 200, 'Email preferences retrieved', { preferences: await userService.getEmailPreferences(req.userId) })
}

export async function updateMyEmailPreferences(req, res) {
  sendSuccess(res, 200, 'Email preferences updated', { preferences: await userService.updateEmailPreferences(req.userId, req.body) })
}

// Same response whether or not the new address is already taken (no account enumeration).
export async function requestEmailChange(req, res) {
  await accountEmail.requestEmailChange(req.userId, req.body.newEmail, req.body.password)
  sendSuccess(res, 200, 'If that address can be used, we have sent a confirmation link to it. Your email will not change until you open it.')
}
