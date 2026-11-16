import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import * as controller from '../controllers/auth.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { emailOnlySchema, resetPasswordSchema, tokenOnlySchema } from '../schemas/accountEmail.schema.js'
import { loginSchema, registerSchema } from '../schemas/auth.schema.js'
import { sendError } from '../utils/apiResponse.js'

/** Per-IP limiter. `override` (tests) replaces the default limit. */
export const makeLimiter = (defaultLimit, override) =>
  rateLimit({
    windowMs: override?.windowMs ?? 15 * 60 * 1000,
    limit: override?.limit ?? defaultLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => sendError(res, 429, 'Too many attempts. Please try again later.', [], 'RATE_LIMITED'),
  })

export function createAuthRouter({ authRateLimit } = {}) {
  const router = Router()

  const credentials = makeLimiter(20, authRateLimit) // login / register: brute force
  const emailSending = makeLimiter(5, authRateLimit) // endpoints that cause an email to be sent
  const tokenCheck = makeLimiter(20, authRateLimit) // endpoints that accept an emailed token

  router.post('/register', credentials, validate(registerSchema), controller.register)
  router.post('/login', credentials, validate(loginSchema), controller.login)
  router.get('/me', requireAuth, controller.me)
  router.post('/logout', requireAuth, controller.logout)

  router.post('/verify-email', tokenCheck, validate(tokenOnlySchema), controller.verifyEmail)
  router.post('/resend-verification', emailSending, validate(emailOnlySchema), controller.resendVerification)
  router.post('/forgot-password', emailSending, validate(emailOnlySchema), controller.forgotPassword)
  router.post('/reset-password', tokenCheck, validate(resetPasswordSchema), controller.resetPassword)
  router.post('/confirm-email-change', tokenCheck, validate(tokenOnlySchema), controller.confirmEmailChange)
  return router
}
