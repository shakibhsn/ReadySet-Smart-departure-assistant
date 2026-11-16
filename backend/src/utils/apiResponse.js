export class AppError extends Error {
  /** `code` is a stable machine-readable reason the frontend can branch on (e.g. TOKEN_EXPIRED). */
  constructor(status, message, errors = [], code = null) {
    super(message)
    this.status = status
    this.errors = errors
    this.code = code
    this.expected = true
  }
}

export const sendSuccess = (res, status, message, data = {}) =>
  res.status(status).json({ success: true, message, data })

export const sendError = (res, status, message, errors = [], code = null) =>
  res.status(status).json({ success: false, message, errors, ...(code && { code }) })
