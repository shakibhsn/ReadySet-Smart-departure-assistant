import { createHash, randomBytes } from 'node:crypto'
import { AppError } from '../utils/apiResponse.js'

/**
 * Single-use emailed tokens (verify email, reset password, confirm email change).
 *  - 256 bits of randomness, URL-safe.
 *  - Only the SHA-256 hash is stored; the plaintext exists only inside the email link.
 *  - A hash lookup (not a string compare against stored secrets) means a database leak does not
 *    reveal usable links.
 */
export const TOKEN_TYPES = Object.freeze({
  EMAIL_VERIFY: 'EMAIL_VERIFY',
  PASSWORD_RESET: 'PASSWORD_RESET',
  EMAIL_CHANGE: 'EMAIL_CHANGE',
})

export const TOKEN_TTL_MINUTES = Object.freeze({
  EMAIL_VERIFY: 24 * 60,
  PASSWORD_RESET: 30,
  EMAIL_CHANGE: 60,
})

/** Minimum gap between two emails of the same kind for one account (prevents mail bombing). */
export const RESEND_COOLDOWN_SECONDS = 60

export const hashToken = (raw) => createHash('sha256').update(raw).digest('hex')

/**
 * Creates a new token and supersedes (deletes) any unused older token of the same type for the user,
 * so only the newest link works. Returns the PLAINTEXT token (to put in the email link only).
 * @param {import('@prisma/client').Prisma.TransactionClient} db
 */
export async function issueToken(db, userId, type, { newEmail = null } = {}) {
  const raw = randomBytes(32).toString('base64url')
  await db.authToken.deleteMany({ where: { userId, type, usedAt: null } })
  await db.authToken.create({
    data: {
      userId,
      type,
      tokenHash: hashToken(raw),
      newEmail,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES[type] * 60_000),
    },
  })
  return raw
}

/** True when an unused token of this type was issued within the cooldown window. */
export async function issuedRecently(db, userId, type, seconds = RESEND_COOLDOWN_SECONDS) {
  const recent = await db.authToken.findFirst({
    where: { userId, type, usedAt: null, createdAt: { gt: new Date(Date.now() - seconds * 1000) } },
    select: { id: true },
  })
  return Boolean(recent)
}

/**
 * Validates and atomically consumes a token. Throws AppError(400) with a code:
 *   INVALID_TOKEN (unknown / wrong type), TOKEN_EXPIRED, TOKEN_USED.
 * The "claim" is a conditional UPDATE (usedAt IS NULL), so two simultaneous requests can never
 * both succeed with the same token.
 * @returns the token row (userId, newEmail, ...)
 */
export async function consumeToken(db, rawToken, type) {
  const row = await db.authToken.findUnique({ where: { tokenHash: hashToken(rawToken) } })
  if (!row || row.type !== type) throw new AppError(400, 'This link is invalid.', [], 'INVALID_TOKEN')
  if (row.usedAt) throw new AppError(400, 'This link has already been used.', [], 'TOKEN_USED')
  if (row.expiresAt <= new Date()) throw new AppError(400, 'This link has expired.', [], 'TOKEN_EXPIRED')

  const claimed = await db.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } })
  if (claimed.count !== 1) throw new AppError(400, 'This link has already been used.', [], 'TOKEN_USED')
  return row
}
