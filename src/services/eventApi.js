import { apiRequest } from '@/lib/apiClient'

/**
 * HOW DATE-TIMES TRAVEL BETWEEN FRONTEND AND BACKEND
 *  - Sending: the form sends the LOCAL wall time the user typed (e.g. "2026-11-20T10:00") together with
 *    an IANA `timezone`. The server converts it to a UTC instant, so the browser's own timezone is
 *    never involved.
 *  - Receiving: every event has `startAt` (UTC instant, ISO) plus `localDate` ("yyyy-MM-dd") and
 *    `localTime` ("HH:mm") already expressed in the event's own timezone. The UI displays those
 *    strings directly and never re-parses them through the browser zone.
 *  - Filters (`from` / `to`): "yyyy-MM-dd" days are interpreted by the server in the user's
 *    saved timezone (or `timezone` when given).
 */

const query = (params = {}) => {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

/** Adds the field names the existing UI components already use (date, startTime, travelMinutes...). */
export function normalizeEvent(e) {
  return {
    ...e,
    date: e.localDate,
    startTime: e.localTime,
    travelMinutes: e.travelDurationMinutes,
    prepMinutes: e.preparationMinutes,
    bufferMinutes: e.arrivalBufferMinutes,
    key: `${e.id}|${e.startAt}`, // unique per occurrence of a recurring series
  }
}

const eventsOf = (res) => (res.data?.events ?? []).map(normalizeEvent)

export const createEvent = async (payload) => normalizeEvent((await apiRequest('/events', { method: 'POST', body: payload })).data.event)

export async function getEvents(params) {
  const res = await apiRequest(`/events${query(params)}`)
  return {
    events: eventsOf(res),
    pagination: res.data?.pagination ?? { page: 1, limit: 10, total: 0, totalPages: 0 },
  }
}

export const getEventById = async (id) => normalizeEvent((await apiRequest(`/events/${encodeURIComponent(id)}`)).data.event)

export const updateEvent = async (id, payload) =>
  normalizeEvent((await apiRequest(`/events/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload })).data.event)

export const deleteEvent = (id) => apiRequest(`/events/${encodeURIComponent(id)}`, { method: 'DELETE' })

export const getUpcomingEvents = async (params) => eventsOf(await apiRequest(`/events/upcoming${query(params)}`))

/** All occurrences (recurring series expanded) between two days, e.g. for calendar views. */
export const getOccurrences = async (params) => eventsOf(await apiRequest(`/events/occurrences${query(params)}`))
