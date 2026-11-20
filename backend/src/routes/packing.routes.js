import { Router } from 'express'
import * as controller from '../controllers/packing.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { itemParamSchema } from '../schemas/checklist.schema.js'
import {
  createPackingTemplateSchema, createPlaceSchema, defaultPlaceSchema, packingTemplateIdSchema, placeIdSchema,
  suggestionsQuerySchema, updatePackingTemplateSchema, updatePlaceSchema,
} from '../schemas/packing.schema.js'

/** /api/places */
export const placesRouter = Router()
placesRouter.use(requireAuth)
placesRouter.get('/', controller.listPlaces)
placesRouter.post('/', validate(createPlaceSchema), controller.createPlace)
placesRouter.patch('/default', validate(defaultPlaceSchema), controller.setDefault) // fixed path before '/:id'
placesRouter.patch('/:id', validate(placeIdSchema, 'params'), validate(updatePlaceSchema), controller.updatePlace)
placesRouter.delete('/:id', validate(placeIdSchema, 'params'), controller.deletePlace)

/** /api/packing-templates */
export const packingTemplatesRouter = Router()
packingTemplatesRouter.use(requireAuth)
packingTemplatesRouter.get('/', controller.listPackingTemplates)
packingTemplatesRouter.post('/', validate(createPackingTemplateSchema), controller.createPackingTemplate)
packingTemplatesRouter.patch('/:id', validate(packingTemplateIdSchema, 'params'), validate(updatePackingTemplateSchema), controller.updatePackingTemplate)
packingTemplatesRouter.delete('/:id', validate(packingTemplateIdSchema, 'params'), controller.deletePackingTemplate)

/** /api/packing */
export const packingRouter = Router()
packingRouter.use(requireAuth)
packingRouter.get('/suggestions', validate(suggestionsQuerySchema, 'query'), controller.suggestions)
packingRouter.get('/forgotten', controller.forgotten)

/** Mounted at /api/events: "I forgot this" for one checklist item (explicit user action only). */
export const forgotRouter = Router()
forgotRouter.use(requireAuth)
forgotRouter.post('/:id/checklist/:itemId/forgot', validate(itemParamSchema, 'params'), controller.reportForgotten)
forgotRouter.delete('/:id/checklist/:itemId/forgot', validate(itemParamSchema, 'params'), controller.undoForgotten)
