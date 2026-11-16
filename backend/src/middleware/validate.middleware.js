import { AppError } from '../utils/apiResponse.js'

/**
 * Validates `req[source]` (body | query | params).
 * Body: req.body is replaced with the parsed (trimmed / normalised) data.
 * Query / params: parsed data is exposed as req.validated.query / req.validated.params
 * (Express 5 makes req.query read-only).
 */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const input = source === 'body' ? (req.body ?? {}) : req[source]
  const result = schema.safeParse(input)
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.') || source, message: i.message }))
    return next(new AppError(400, 'Validation failed', errors))
  }
  if (source === 'body') req.body = result.data
  else (req.validated ??= {})[source] = result.data
  next()
}
