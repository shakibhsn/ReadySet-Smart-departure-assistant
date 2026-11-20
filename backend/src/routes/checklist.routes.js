import { Router } from 'express'
import * as controller from '../controllers/checklist.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { applyTemplateSchema, completionSchema, createItemSchema, eventIdParamSchema, itemParamSchema, updateItemSchema } from '../schemas/checklist.schema.js'

// Mounted at /api/events (before the event router), so these are /api/events/:id/checklist...
const router = Router()
router.use(requireAuth)

const ev = validate(eventIdParamSchema, 'params')
const it = validate(itemParamSchema, 'params')

router.get('/:id/checklist', ev, controller.get)
router.post('/:id/checklist', ev, validate(createItemSchema), controller.add)
router.post('/:id/checklist/apply-template', ev, validate(applyTemplateSchema), controller.applyTemplate)
router.patch('/:id/checklist/:itemId', it, validate(updateItemSchema), controller.update)
router.patch('/:id/checklist/:itemId/completion', it, validate(completionSchema), controller.complete)
router.delete('/:id/checklist/:itemId', it, controller.remove)

export const templatesRouter = Router()
templatesRouter.use(requireAuth)
templatesRouter.get('/', controller.templates)

export default router
