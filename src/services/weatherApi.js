import { apiRequest } from '@/lib/apiClient'

/** Optional context only: the backend always answers 200 with a `status`; it never changes the departure plan. */
export const getEventWeather = async (eventId) => (await apiRequest(`/events/${encodeURIComponent(eventId)}/weather`)).data.weather
