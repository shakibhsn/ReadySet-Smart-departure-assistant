import { Router } from 'express'
import * as controller from '../controllers/departure.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { previewDepartureSchema, todayPlansQuerySchema, upcomingPlansQuerySchema } from '../services/departure/departureValidation.js'

const router = Router()
router.use(requireAuth)

// Fixed paths only; the per-event plan lives under /api/events/:id/departure-plan.
router.post('/preview', validate(previewDepartureSchema), controller.preview)
router.get('/today', validate(todayPlansQuerySchema, 'query'), controller.today)
router.get('/upcoming', validate(upcomingPlansQuerySchema, 'query'), controller.upcoming)

export default router
