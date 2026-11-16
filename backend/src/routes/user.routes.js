import { Router } from 'express'
import * as controller from '../controllers/user.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { updatePreferencesSchema, updateProfileSchema } from '../schemas/user.schema.js'

const router = Router()

router.use(requireAuth)
router.get('/me', controller.getMe)
router.patch('/me', validate(updateProfileSchema), controller.updateMe)
router.get('/me/preferences', controller.getMyPreferences)
router.patch('/me/preferences', validate(updatePreferencesSchema), controller.updateMyPreferences)

export default router
