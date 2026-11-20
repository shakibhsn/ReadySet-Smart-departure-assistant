import { Router } from 'express'
import * as controller from '../controllers/notification.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { idParamSchema, listQuerySchema } from '../schemas/notification.schema.js'

const router = Router()
router.use(requireAuth)

router.get('/', validate(listQuerySchema, 'query'), controller.list)
// Fixed paths before '/:id'.
router.get('/unread-count', controller.unreadCount)
router.post('/read-all', controller.readAll)
router.patch('/:id/read', validate(idParamSchema, 'params'), controller.read)
router.delete('/:id', validate(idParamSchema, 'params'), controller.remove)

export default router
