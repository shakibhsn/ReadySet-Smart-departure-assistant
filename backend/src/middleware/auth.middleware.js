import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { AppError } from '../utils/apiResponse.js'

const UNAUTHENTICATED = 'Authentication required'

/**
 * Verifies the Bearer token and attaches the verified user id as req.userId.
 * The id always comes from the signed token, never from the request body or URL.
 */
export function requireAuth(req, _res, next) {
  const header = req.get('authorization') ?? ''
  const [scheme, token, extra] = header.split(' ')
  if (scheme !== 'Bearer' || !token || extra) return next(new AppError(401, UNAUTHENTICATED))

  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] })
    if (typeof payload.sub !== 'string') return next(new AppError(401, 'Invalid token'))
    req.userId = payload.sub
    next()
  } catch (err) {
    const message = err?.name === 'TokenExpiredError' ? 'Session expired. Please log in again.' : 'Invalid token'
    next(new AppError(401, message))
  }
}
