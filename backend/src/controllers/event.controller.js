import * as eventService from '../services/event.service.js'
import { sendSuccess } from '../utils/apiResponse.js'

// userId is ALWAYS req.userId (set by requireAuth from the verified JWT), never from the request.

export async function create(req, res) {
  const event = await eventService.createEvent(req.userId, req.body)
  sendSuccess(res, 201, 'Event created', { event })
}

export async function list(req, res) {
  sendSuccess(res, 200, 'Events retrieved', await eventService.listEvents(req.userId, req.validated.query))
}

export async function upcoming(req, res) {
  sendSuccess(res, 200, 'Upcoming events retrieved', await eventService.getUpcoming(req.userId, req.validated.query))
}

export async function occurrences(req, res) {
  sendSuccess(res, 200, 'Occurrences retrieved', await eventService.getOccurrences(req.userId, req.validated.query))
}

export async function getOne(req, res) {
  sendSuccess(res, 200, 'Event retrieved', { event: await eventService.getEvent(req.userId, req.validated.params.id) })
}

export async function update(req, res) {
  const event = await eventService.updateEvent(req.userId, req.validated.params.id, req.body)
  sendSuccess(res, 200, 'Event updated', { event })
}

export async function remove(req, res) {
  await eventService.deleteEvent(req.userId, req.validated.params.id)
  sendSuccess(res, 200, 'Event deleted')
}
