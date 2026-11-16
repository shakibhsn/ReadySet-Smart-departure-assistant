import { AppError } from '../utils/apiResponse.js'

/** Validates and replaces req.body with the parsed (trimmed / normalised) data. */
export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body ?? {})
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.') || 'body', message: i.message }))
    return next(new AppError(400, 'Validation failed', errors))
  }
  req.body = result.data
  next()
}
