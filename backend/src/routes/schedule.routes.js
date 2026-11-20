import { Router } from 'express'
import * as controller from '../controllers/schedule.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { conflictQuerySchema } from '../schemas/conflict.schema.js'
import { idParamSchema } from '../schemas/event.schema.js'
import { occurrenceRefSchema, overrideOccurrenceSchema } from '../schemas/occurrence.schema.js'
import { createTemplateSchema, templateIdSchema, updateTemplateSchema, useTemplateSchema } from '../schemas/template.schema.js'
import { makeLimiter } from './auth.routes.js'

const ev = validate(idParamSchema, 'params')
const tpl = validate(templateIdSchema, 'params')

/** Mounted at /api/events (before the event router): per-occurrence changes. */
export const occurrenceRouter = Router()
occurrenceRouter.use(requireAuth)
occurrenceRouter.get('/:id/exceptions', ev, controller.listExceptions)
occurrenceRouter.post('/:id/occurrences/skip', ev, validate(occurrenceRefSchema), controller.skip)
occurrenceRouter.patch('/:id/occurrences', ev, validate(overrideOccurrenceSchema), controller.override)
occurrenceRouter.post('/:id/occurrences/restore', ev, validate(occurrenceRefSchema), controller.restore)

/** Mounted at /api/event-templates. */
export const templateRouter = Router()
templateRouter.use(requireAuth)
templateRouter.get('/', controller.listTemplates)
templateRouter.post('/', validate(createTemplateSchema), controller.createTemplate)
templateRouter.patch('/:id', tpl, validate(updateTemplateSchema), controller.updateTemplate)
templateRouter.delete('/:id', tpl, controller.deleteTemplate)
templateRouter.post('/:id/create-event', tpl, validate(useTemplateSchema), controller.useTemplate)

/** Mounted at /api/schedule. The analysis does bounded but real work, so it is rate limited per IP. */
export const scheduleRouter = Router()
scheduleRouter.use(requireAuth)
scheduleRouter.get('/conflicts', makeLimiter(120), validate(conflictQuerySchema, 'query'), controller.conflicts)
