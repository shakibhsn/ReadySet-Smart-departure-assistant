import * as packing from '../services/packing.service.js'
import * as places from '../services/place.service.js'
import { sendSuccess } from '../utils/apiResponse.js'

// userId is ALWAYS req.userId (from the verified JWT), never from the request.

export const listPlaces = async (req, res) => sendSuccess(res, 200, 'Places retrieved', await places.listPlaces(req.userId))
export const createPlace = async (req, res) => sendSuccess(res, 201, 'Place saved', await places.createPlace(req.userId, req.body))
export const updatePlace = async (req, res) => sendSuccess(res, 200, 'Place updated', await places.updatePlace(req.userId, req.validated.params.id, req.body))
export const deletePlace = async (req, res) => sendSuccess(res, 200, 'Place deleted', await places.deletePlace(req.userId, req.validated.params.id))
export const setDefault = async (req, res) => sendSuccess(res, 200, 'Default starting location updated', await places.setDefaultStart(req.userId, req.body.placeId))

export const listPackingTemplates = async (req, res) => sendSuccess(res, 200, 'Packing templates retrieved', await packing.listPackingTemplates(req.userId))
export const createPackingTemplate = async (req, res) => sendSuccess(res, 201, 'Packing template saved', await packing.createPackingTemplate(req.userId, req.body))
export const updatePackingTemplate = async (req, res) => sendSuccess(res, 200, 'Packing template updated', await packing.updatePackingTemplate(req.userId, req.validated.params.id, req.body))
export async function deletePackingTemplate(req, res) {
  await packing.deletePackingTemplate(req.userId, req.validated.params.id)
  sendSuccess(res, 200, 'Packing template deleted')
}

export const suggestions = async (req, res) => sendSuccess(res, 200, 'Packing suggestions retrieved', await packing.suggestionsFor(req.userId, req.validated.query.category))
export const forgotten = async (req, res) => sendSuccess(res, 200, 'Frequently forgotten items retrieved', { items: await packing.frequentlyForgotten(req.userId) })
export const reportForgotten = async (req, res) => sendSuccess(res, 200, 'Thanks, noted', await packing.reportForgotten(req.userId, req.validated.params.id, req.validated.params.itemId))
export const undoForgotten = async (req, res) => sendSuccess(res, 200, 'Report removed', await packing.undoForgotten(req.userId, req.validated.params.id, req.validated.params.itemId))
