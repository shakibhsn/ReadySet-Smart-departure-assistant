import * as service from '../services/checklist/checklist.service.js'
import { listTemplates } from '../services/checklist/checklistTemplates.js'
import { sendSuccess } from '../utils/apiResponse.js'

// userId is ALWAYS req.userId (from the verified JWT), never from the request.

export const templates = (_req, res) => sendSuccess(res, 200, 'Checklist templates retrieved', { templates: listTemplates() })

export async function get(req, res) {
  sendSuccess(res, 200, 'Checklist retrieved', await service.getChecklist(req.userId, req.validated.params.id))
}
export async function add(req, res) {
  sendSuccess(res, 201, 'Item added', { item: await service.addItem(req.userId, req.validated.params.id, req.body) })
}
export async function applyTemplate(req, res) {
  sendSuccess(res, 200, 'Template applied', await service.applyTemplate(req.userId, req.validated.params.id, req.body))
}
export async function update(req, res) {
  const { id, itemId } = req.validated.params
  sendSuccess(res, 200, 'Item updated', { item: await service.updateItem(req.userId, id, itemId, req.body) })
}
export async function complete(req, res) {
  const { id, itemId } = req.validated.params
  sendSuccess(res, 200, 'Item updated', { item: await service.setCompletion(req.userId, id, itemId, req.body.done, req.body.baseUpdatedAt) })
}
export async function remove(req, res) {
  const { id, itemId } = req.validated.params
  await service.deleteItem(req.userId, id, itemId)
  sendSuccess(res, 200, 'Item deleted')
}
