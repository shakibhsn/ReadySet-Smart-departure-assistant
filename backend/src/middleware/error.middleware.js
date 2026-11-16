import { env } from '../config/env.js'
import { AppError, sendError } from '../utils/apiResponse.js'

export const notFoundHandler = (_req, _res, next) => next(new AppError(404, 'Route not found'))

// Express identifies error handlers by their 4 arguments, so `_next` must stay in the signature.
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) return sendError(res, err.status, err.message, err.errors)

  // Malformed JSON / oversized body from express.json()
  if (err?.type === 'entity.parse.failed') return sendError(res, 400, 'Malformed JSON body')
  if (err?.type === 'entity.too.large') return sendError(res, 413, 'Request body too large')

  // Unique constraint race (two simultaneous registrations with the same email).
  if (err?.code === 'P2002') return sendError(res, 409, 'A record with this value already exists')

  // Unexpected: log only the message server-side, never the request body, and never leak details.
  console.error('Unhandled error:', err?.name, err?.message)
  if (env.NODE_ENV !== 'production' && err?.stack) console.error(err.stack)
  return sendError(res, 500, 'Something went wrong. Please try again later.')
}
