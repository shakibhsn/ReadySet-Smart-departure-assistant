import { apiRequest } from '@/lib/apiClient'
import { queryString } from '@/lib/queryString'

/**
 * Departure plans are calculated by the BACKEND (the source of truth). Every plan has UTC ISO
 * timestamps in `plan`, the same milestones as local clock times in the event's timezone in `local`,
 * plus `durations`, `status`, `readiness`, `explanation` and `calculatedAt`.
 */

/** Plan for one saved event. `occurrence` (ISO instant) picks a specific repeat of a recurring event. */
export const getEventDeparturePlan = async (eventId, params) =>
  (await apiRequest(`/events/${encodeURIComponent(eventId)}/departure-plan${queryString(params)}`)).data

/** What-if calculation. Saves nothing. */
export const previewDeparturePlan = async (payload) => (await apiRequest('/departure/preview', { method: 'POST', body: payload })).data

export async function getTodayPlans() {
  const data = (await apiRequest('/departure/today')).data
  return { ...data, plans: data?.plans ?? [] }
}

/** Plans for upcoming occurrences, sorted by departure time. */
export async function getUpcomingPlans({ days = 14, limit = 5 } = {}) {
  const data = (await apiRequest(`/departure/upcoming${queryString({ days, limit })}`)).data
  return { ...data, plans: data?.plans ?? [] }
}
