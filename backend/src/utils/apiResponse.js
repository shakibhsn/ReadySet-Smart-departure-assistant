export class AppError extends Error {
  constructor(status, message, errors = []) {
    super(message)
    this.status = status
    this.errors = errors
    this.expected = true
  }
}

export const sendSuccess = (res, status, message, data = {}) =>
  res.status(status).json({ success: true, message, data })

export const sendError = (res, status, message, errors = []) =>
  res.status(status).json({ success: false, message, errors })
