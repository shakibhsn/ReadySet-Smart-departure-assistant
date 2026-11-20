import { getConflicts } from '../services/conflict/conflict.service.js'
import * as exceptions from '../services/eventException.service.js'
import * as templates from '../services/eventTemplate.service.js'
import { sendSuccess } from '../utils/apiResponse.js'

// userId is ALWAYS req.userId (from the verified JWT), never from the request.

export const skip = async (req, res) => sendSuccess(res, 200, 'Occurrence skipped', await exceptions.skipOccurrence(req.userId, req.validated.params.id, req.body))
export const override = async (req, res) => sendSuccess(res, 200, 'Occurrence updated', await exceptions.overrideOccurrence(req.userId, req.validated.params.id, req.body))
export const restore = async (req, res) => sendSuccess(res, 200, 'Occurrence restored', await exceptions.restoreOccurrence(req.userId, req.validated.params.id, req.body))
export const listExceptions = async (req, res) => sendSuccess(res, 200, 'Occurrence changes retrieved', await exceptions.listExceptions(req.userId, req.validated.params.id))

export const listTemplates = async (req, res) => sendSuccess(res, 200, 'Templates retrieved', await templates.listTemplates(req.userId))
export const createTemplate = async (req, res) => sendSuccess(res, 201, 'Template saved', await templates.createTemplate(req.userId, req.body))
export const updateTemplate = async (req, res) => sendSuccess(res, 200, 'Template updated', await templates.updateTemplate(req.userId, req.validated.params.id, req.body))
export async function deleteTemplate(req, res) {
  await templates.deleteTemplate(req.userId, req.validated.params.id)
  sendSuccess(res, 200, 'Template deleted')
}
export const useTemplate = async (req, res) => sendSuccess(res, 201, 'Event created from template', await templates.createEventFromTemplate(req.userId, req.validated.params.id, req.body))

export const conflicts = async (req, res) => sendSuccess(res, 200, 'Conflicts analysed', await getConflicts(req.userId, req.validated.query, new Date()))
