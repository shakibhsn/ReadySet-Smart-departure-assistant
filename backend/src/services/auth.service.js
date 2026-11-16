import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/database.js'
import { emailConfig } from '../config/email.config.js'
import { env } from '../config/env.js'
import { AppError } from '../utils/apiResponse.js'
import { sendVerificationEmail } from './accountEmail.service.js'

// Fields that are safe to send to the client. passwordHash and tokenVersion are deliberately absent.
export const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
}

export const preferenceSelect = {
  defaultPreparationMinutes: true,
  defaultArrivalBufferMinutes: true,
  preferredTravelMode: true,
  timezone: true,
}

/** Public user shape: exposes only a boolean for verification, not internal timestamps. */
export function serializeUser({ emailVerifiedAt, ...user }) {
  return { ...user, emailVerified: Boolean(emailVerifiedAt) }
}

// Used to keep login timing similar whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', env.BCRYPT_ROUNDS)

// The token carries the user's current tokenVersion ("tv"). Logout / password reset / email change
// bump the version in the database, which makes every token issued before it invalid.
export const signToken = (userId, tokenVersion) =>
  jwt.sign({ sub: userId, tv: tokenVersion }, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: env.JWT_EXPIRES_IN })

export async function registerUser({ name, email, password }) {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) throw new AppError(409, 'An account with this email already exists', [{ field: 'email', message: 'Email is already registered' }])

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS)
  // Enforcement only applies to accounts created while the switch is on; existing users are never affected.
  const verificationRequired = emailConfig.verificationRequired

  // User and default preferences are created atomically: both succeed or neither does.
  const { tokenVersion, ...created } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, email, passwordHash, emailVerificationRequired: verificationRequired },
      select: { ...safeUserSelect, tokenVersion: true },
    })
    const preference = await tx.userPreference.create({ data: { userId: user.id }, select: preferenceSelect })
    return { ...user, preference }
  })

  // Verification email is queued after commit; a provider outage can never fail registration.
  await sendVerificationEmail(created)

  const user = serializeUser(created)
  return { user, token: verificationRequired ? null : signToken(user.id, tokenVersion), verificationRequired }
}

export async function loginUser({ email, password }) {
  const found = await prisma.user.findUnique({
    where: { email },
    select: { ...safeUserSelect, passwordHash: true, tokenVersion: true, emailVerificationRequired: true, preference: { select: preferenceSelect } },
  })

  const valid = await bcrypt.compare(password, found?.passwordHash ?? DUMMY_HASH)
  if (!found || !valid) throw new AppError(401, 'Invalid email or password')

  // Only accounts created under mandatory verification are blocked. Pre-existing accounts keep working.
  if (found.emailVerificationRequired && !found.emailVerifiedAt) {
    throw new AppError(403, 'Please verify your email address before logging in.', [], 'EMAIL_NOT_VERIFIED')
  }

  const { passwordHash, tokenVersion, emailVerificationRequired, ...rest } = found // eslint-disable-line no-unused-vars
  return { user: serializeUser(rest), token: signToken(rest.id, tokenVersion) }
}

export async function getCurrentUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...safeUserSelect, preference: { select: preferenceSelect } },
  })
  // Valid token for a user that no longer exists (e.g. deleted account).
  if (!user) throw new AppError(401, 'Invalid token')
  return serializeUser(user)
}

/** Logout: invalidates every token issued so far for this user (on all devices). */
export async function revokeUserTokens(userId) {
  await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } })
}
