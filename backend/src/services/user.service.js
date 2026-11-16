import { prisma } from '../config/database.js'
import { AppError } from '../utils/apiResponse.js'
import { preferenceSelect, safeUserSelect } from './auth.service.js'

// Every query is scoped by the authenticated user's id (from the verified JWT),
// so one user can never read or change another user's data.

export async function getProfile(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: safeUserSelect })
  if (!user) throw new AppError(404, 'User not found')
  return user
}

export async function updateProfile(userId, data) {
  try {
    return await prisma.user.update({ where: { id: userId }, data, select: safeUserSelect })
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
