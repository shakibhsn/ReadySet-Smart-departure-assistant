import { Router } from 'express'
import * as controller from '../controllers/event.controller.js'
import { eventPlan } from '../controllers/departure.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { departurePlanQuerySchema } from '../services/departure/departureValidation.js'
import {
  createEventSchema,
  idParamSchema,
  listEventsQuerySchema,
  occurrencesQuerySchema,
  updateEventSchema,
  upcomingQuerySchema,
} from '../schemas/event.schema.js'

const router = Router()
router.use(requireAuth)

router.post('/', validate(createEventSchema), controller.create)
router.get('/', validate(listEventsQuerySchema, 'query'), controller.list)

// Fixed paths MUST be declared before '/:id', otherwise "upcoming" would be treated as an id.
router.get('/upcoming', validate(upcomingQuerySchema, 'query'), controller.upcoming)
router.get('/occurrences', validate(occurrencesQuerySchema, 'query'), controller.occurrences)

router.get('/:id/departure-plan', validate(idParamSchema, 'params'), validate(departurePlanQuerySchema, 'query'), eventPlan)
router.get('/:id', validate(idParamSchema, 'params'), controller.getOne)
router.patch('/:id', validate(idParamSchema, 'params'), validate(updateEventSchema), controller.update)
router.delete('/:id', validate(idParamSchema, 'params'), controller.remove)

export default router
