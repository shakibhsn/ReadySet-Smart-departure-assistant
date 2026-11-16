import { prisma } from '../config/database.js'
import { AppError } from '../utils/apiResponse.js'
import { preferenceSelect, safeUserSelect, serializeUser } from './auth.service.js'

// Every query is scoped by the authenticated user's id (from the verified JWT),
// so one user can never read or change another user's data.

export async function getProfile(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: safeUserSelect })
  if (!user) throw new AppError(404, 'User not found')
  return serializeUser(user)
}

export async function updateProfile(userId, data) {
  try {
    return serializeUser(await prisma.user.update({ where: { id: userId }, data, select: safeUserSelect }))
  } catch (err) {
    if (err.code === 'P2025') throw new AppError(404, 'User not found')
    throw err
  }
}

export async function getPreferences(userId) {
  const preference = await prisma.userPreference.findUnique({ where: { userId }, select: preferenceSelect })
  if (!preference) throw new AppError(404, 'Preferences not found')
  return preference
}

export async function updatePreferences(userId, data) {
  try {
    return await prisma.userPreference.update({ where: { userId }, data, select: preferenceSelect })
  } catch (err) {
    if (err.code === 'P2025') throw new AppError(404, 'Preferences not found')
    throw err
  }
}

// ---------- email preferences ----------

const emailPrefSelect = { emailUpcomingReminders: true, emailPrepReminders: true, emailDepartureReminders: true }

// Account-security emails are not optional and are listed here only so the UI can show them.
const REQUIRED_EMAILS = { security: true, emailVerification: true, passwordReset: true }

const toEmailPreferences = (p) => ({
  required: REQUIRED_EMAILS,
  upcomingEventReminders: p.emailUpcomingReminders,
  prepStartReminders: p.emailPrepReminders,
  departureReminders: p.emailDepartureReminders,
})

export async function getEmailPreferences(userId) {
  const pref = await prisma.userPreference.findUnique({ where: { userId }, select: emailPrefSelect })
  if (!pref) throw new AppError(404, 'Preferences not found')
  return toEmailPreferences(pref)
}

export async function updateEmailPreferences(userId, input) {
  const data = {}
  if (input.upcomingEventReminders !== undefined) data.emailUpcomingReminders = input.upcomingEventReminders
  if (input.prepStartReminders !== undefined) data.emailPrepReminders = input.prepStartReminders
  if (input.departureReminders !== undefined) data.emailDepartureReminders = input.departureReminders
  try {
    return toEmailPreferences(await prisma.userPreference.update({ where: { userId }, data, select: emailPrefSelect }))
  } catch (err) {
    if (err.code === 'P2025') throw new AppError(404, 'Preferences not found')
    throw err
  }
}
