import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { analyticsQuerySchema, weekQuerySchema } from '../schemas/analytics.schema.js'
import * as analytics from '../services/analytics/analytics.service.js'
import { sendSuccess } from '../utils/apiResponse.js'

// Read-only; userId is ALWAYS req.userId (from the verified JWT).
export const analyticsRouter = Router()
analyticsRouter.use(requireAuth)
analyticsRouter.get('/', validate(analyticsQuerySchema, 'query'), async (req, res) => sendSuccess(res, 200, 'Analytics retrieved', await analytics.getAnalytics(req.userId, req.validated.query)))

export const weekRouter = Router()
weekRouter.use(requireAuth)
weekRouter.get('/', validate(weekQuerySchema, 'query'), async (req, res) => sendSuccess(res, 200, 'Week retrieved', await analytics.getWeek(req.userId, req.validated.query)))
