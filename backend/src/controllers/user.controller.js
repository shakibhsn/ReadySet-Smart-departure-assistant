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
