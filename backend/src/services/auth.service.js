import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/database.js'
import { env } from '../config/env.js'
import { AppError } from '../utils/apiResponse.js'

// Fields that are safe to send to the client. passwordHash is deliberately absent.
export const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
  updatedAt: true,
}

export const preferenceSelect = {
  defaultPreparationMinutes: true,
  defaultArrivalBufferMinutes: true,
  preferredTravelMode: true,
  timezone: true,
}

// Used to keep login timing similar whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', env.BCRYPT_ROUNDS)

export const signToken = (userId) =>
  jwt.sign({ sub: userId }, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: env.JWT_EXPIRES_IN })

export async function registerUser({ name, email, password }) {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) throw new AppError(409, 'An account with this email already exists', [{ field: 'email', message: 'Email is already registered' }])

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS)

  // User and default preferences are created atomically: both succeed or neither does.
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { name, email, passwordHash }, select: safeUserSelect })
    const preference = await tx.userPreference.create({ data: { userId: created.id }, select: preferenceSelect })
    return { ...created, preference }
  })

  return { user, token: signToken(user.id) }
}

export async function loginUser({ email, password }) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { ...safeUserSelect, passwordHash: true, preference: { select: preferenceSelect } },
  })

  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !valid) throw new AppError(401, 'Invalid email or password')

  // eslint-disable-next-line no-unused-vars
  const { passwordHash, ...safeUser } = user
  return { user: safeUser, token: signToken(user.id) }
}

export async function getCurrentUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...safeUserSelect, preference: { select: preferenceSelect } },
  })
  // Valid token for a user that no longer exists (e.g. deleted account).
  if (!user) throw new AppError(401, 'Invalid token')
  return user
}
