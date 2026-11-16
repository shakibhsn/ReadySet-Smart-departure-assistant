import { Router } from 'express'
import * as controller from '../controllers/user.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { requestEmailChangeSchema, updateEmailPreferencesSchema } from '../schemas/accountEmail.schema.js'
import { updatePreferencesSchema, updateProfileSchema } from '../schemas/user.schema.js'
import { makeLimiter } from './auth.routes.js'

export function createUserRouter({ authRateLimit } = {}) {
  const router = Router()
  router.use(requireAuth)

  router.get('/me', controller.getMe)
  router.patch('/me', validate(updateProfileSchema), controller.updateMe)
  router.get('/me/preferences', controller.getMyPreferences)
  router.patch('/me/preferences', validate(updatePreferencesSchema), controller.updateMyPreferences)
  router.get('/me/email-preferences', controller.getMyEmailPreferences)
  router.patch('/me/email-preferences', validate(updateEmailPreferencesSchema), controller.updateMyEmailPreferences)
  router.post('/me/email-change', makeLimiter(5, authRateLimit), validate(requestEmailChangeSchema), controller.requestEmailChange)
  return router
}
