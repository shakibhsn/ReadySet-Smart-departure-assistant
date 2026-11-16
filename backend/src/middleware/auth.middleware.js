import jwt from 'jsonwebtoken'
import { prisma } from '../config/database.js'
import { env } from '../config/env.js'
import { AppError } from '../utils/apiResponse.js'

const UNAUTHENTICATED = 'Authentication required'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 1. Verifies the Bearer token (HS256 signature + expiry).
 * 2. Checks the user still exists and the token's version matches the database, so tokens
 *    issued before a logout (or for a deleted user) are rejected with 401.
 * The user id always comes from the signed token, never from the request body or URL.
 */
export async function requireAuth(req, _res, next) {
  const header = req.get('authorization') ?? ''
  const [scheme, token, extra] = header.split(' ')
  if (scheme !== 'Bearer' || !token || extra) return next(new AppError(401, UNAUTHENTICATED))

  let payload
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] })
  } catch (err) {
    const message = err?.name === 'TokenExpiredError' ? 'Session expired. Please log in again.' : 'Invalid token'
    return next(new AppError(401, message))
  }

  if (typeof payload.sub !== 'string' || !UUID_RE.test(payload.sub) || !Number.isInteger(payload.tv)) {
    return next(new AppError(401, 'Invalid token'))
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { tokenVersion: true } })
  if (!user || user.tokenVersion !== payload.tv) {
    return next(new AppError(401, 'Session expired. Please log in again.'))
  }

  req.userId = payload.sub
  next()
}
