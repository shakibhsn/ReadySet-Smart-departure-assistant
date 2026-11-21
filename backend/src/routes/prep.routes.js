import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { eventIdParamSchema } from '../schemas/checklist.schema.js'
import { logIdSchema, logsQuerySchema, overrideParamSchema, overrideSchema, prepActionSchema, prepStateQuerySchema, settingsSchema } from '../schemas/prep.schema.js'
import * as prep from '../services/prep/prep.service.js'
import { sendSuccess } from '../utils/apiResponse.js'

// userId is ALWAYS req.userId (from the verified JWT). The server decides every timestamp.

/** Mounted at /api/events: GET/POST /:id/prep-log */
export const prepEventRouter = Router()
prepEventRouter.use(requireAuth)
prepEventRouter.get('/:id/prep-log', validate(eventIdParamSchema, 'params'), validate(prepStateQuerySchema, 'query'), async (req, res) => {
  sendSuccess(res, 200, 'Preparation log retrieved', await prep.getCurrentLog(req.userId, req.validated.params.id, req.validated.query.occurrence, new Date()))
})
prepEventRouter.post('/:id/prep-log', validate(eventIdParamSchema, 'params'), validate(prepActionSchema), async (req, res) => {
  const result = await prep.recordAction(req.userId, req.validated.params.id, req.body, new Date())
  sendSuccess(res, 200, result.changed ? 'Recorded' : 'Already recorded', result)
})

/** Mounted at /api/prep-profile */
export const prepProfileRouter = Router()
prepProfileRouter.use(requireAuth)
prepProfileRouter.get('/', async (req, res) => sendSuccess(res, 200, 'Preparation profile retrieved', await prep.getProfile(req.userId, new Date())))
prepProfileRouter.get('/logs', validate(logsQuerySchema, 'query'), async (req, res) => sendSuccess(res, 200, 'Logs retrieved', await prep.listLogs(req.userId, req.validated.query)))
prepProfileRouter.delete('/logs/:id', validate(logIdSchema, 'params'), async (req, res) => {
  await prep.deleteLog(req.userId, req.validated.params.id)
  sendSuccess(res, 200, 'Log deleted')
})
prepProfileRouter.delete('/data', async (req, res) => sendSuccess(res, 200, 'Your preparation activity was erased', await prep.eraseAllLogs(req.userId)))
prepProfileRouter.patch('/settings', validate(settingsSchema), async (req, res) => sendSuccess(res, 200, 'Setting saved', await prep.setEnabled(req.userId, req.body.enabled)))
prepProfileRouter.put('/overrides', validate(overrideSchema), async (req, res) => sendSuccess(res, 200, 'Your value was saved', await prep.setOverride(req.userId, req.body)))
prepProfileRouter.delete('/overrides/:category', validate(overrideParamSchema, 'params'), async (req, res) => sendSuccess(res, 200, 'Your value was cleared', await prep.clearOverride(req.userId, req.validated.params.category)))
