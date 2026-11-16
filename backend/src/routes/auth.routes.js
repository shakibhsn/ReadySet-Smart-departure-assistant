import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import * as controller from '../controllers/auth.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { loginSchema, registerSchema } from '../schemas/auth.schema.js'
import { sendError } from '../utils/apiResponse.js'

export function createAuthRouter({ authRateLimit } = {}) {
  const router = Router()

  // Limits brute-force login/registration attempts per IP.
  const limiter = rateLimit({
    windowMs: authRateLimit?.windowMs ?? 15 * 60 * 1000,
    limit: authRateLimit?.limit ?? 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => sendError(res, 429, 'Too many attempts. Please try again later.'),
  })

  router.post('/register', limiter, validate(registerSchema), controller.register)
  router.post('/login', limiter, validate(loginSchema), controller.login)
  router.get('/me', requireAuth, controller.me)
  router.post('/logout', requireAuth, controller.logout)
  return router
}
