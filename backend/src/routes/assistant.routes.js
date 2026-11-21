import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { askSchema, confirmSchema } from '../schemas/assistant.schema.js'
import * as assistant from '../services/assistant/assistant.service.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { makeLimiter } from './auth.routes.js'

// userId is ALWAYS req.userId (from the verified JWT). The assistant has exactly two endpoints:
// ask (read-only) and confirm (applies one signed proposal the user explicitly accepted).
export function createAssistantRouter({ assistantRateLimit, assistantOptions } = {}) {
  const router = Router()
  router.use(requireAuth)
  const limiter = makeLimiter(40, { windowMs: 10 * 60 * 1000, ...assistantRateLimit }) // protects the AI quota and the database
  router.post('/ask', limiter, validate(askSchema), async (req, res) => {
    sendSuccess(res, 200, 'Answer ready', await assistant.ask(req.userId, req.body, assistantOptions))
  })
  router.post('/confirm', limiter, validate(confirmSchema), async (req, res) => {
    sendSuccess(res, 200, 'Done', await assistant.confirm(req.userId, req.body, assistantOptions))
  })
  return router
}
