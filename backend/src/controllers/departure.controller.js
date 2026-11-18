import * as departure from '../services/departure/departurePlan.service.js'
import { sendSuccess } from '../utils/apiResponse.js'

// userId is ALWAYS req.userId (from the verified JWT). The clock is read here, once per request, and
// passed down, so the services stay deterministic and testable.

export async function eventPlan(req, res) {
  const plan = await departure.getEventDeparturePlan(req.userId, req.validated.params.id, req.validated.query, new Date())
  sendSuccess(res, 200, 'Departure plan calculated', plan)
}

export async function preview(req, res) {
  sendSuccess(res, 200, 'Departure plan preview calculated', await departure.previewDeparturePlan(req.userId, req.body, new Date()))
}

export async function today(req, res) {
  sendSuccess(res, 200, "Today's departure plans retrieved", await departure.getTodayPlans(req.userId, req.validated.query, new Date()))
}

export async function upcoming(req, res) {
  sendSuccess(res, 200, 'Upcoming departure plans retrieved', await departure.getUpcomingPlans(req.userId, req.validated.query, new Date()))
}
