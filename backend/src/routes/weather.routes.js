import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { eventIdParamSchema } from '../schemas/checklist.schema.js'
import { getEventWeather } from '../services/weather/weather.service.js'
import { sendSuccess } from '../utils/apiResponse.js'

// Mounted at /api/events: GET /api/events/:id/weather. userId is ALWAYS req.userId (verified JWT).
const router = Router()
router.use(requireAuth)

router.get('/:id/weather', validate(eventIdParamSchema, 'params'), async (req, res) => {
  sendSuccess(res, 200, 'Weather retrieved', { weather: await getEventWeather(req.userId, req.validated.params.id, new Date()) })
})

export default router
