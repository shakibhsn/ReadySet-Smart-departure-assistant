import { findOwnedEvent, seriesOf } from '../event.service.js'
import { expandOccurrences } from '../recurrence.service.js'
import { locationCandidates, pickHour } from './weatherHelpers.js'

// Optional, contextual weather for an event (Open-Meteo: free, no API key). It NEVER changes the departure
// calculation. Every provider problem becomes a normal 200 response with a `status`, so the app keeps working.
// Privacy: only the destination text is sent to Open-Meteo (geocoding); no user id, name or email.

export const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
export const TIMEOUT_MS = 5000
export const FORECAST_DAYS = 16 // Open-Meteo's maximum forecast window
const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000
const FORECAST_TTL_MS = 10 * 60 * 1000
const HOUR = 3_600_000

const geocodeCache = new Map()
const forecastCache = new Map()
export function clearWeatherCache() {
  geocodeCache.clear()
  forecastCache.clear()
}

class ProviderError extends Error {
  constructor(kind) {
    super(kind)
    this.kind = kind // 'timeout' | 'failed'
  }
}

async function getJson(url, fetchFn) {
  let res
  try {
    res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err) {
    throw new ProviderError(err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'timeout' : 'failed')
  }
  if (!res.ok) throw new ProviderError('failed')
  try {
    return await res.json()
  } catch {
    throw new ProviderError('failed')
  }
}

const cached = (map, key, ttl, now) => {
  const hit = map.get(key)
  return hit && now - hit.at < ttl ? hit.value : undefined
}

async function geocode(destination, fetchFn, nowMs) {
  for (const name of locationCandidates(destination)) {
    const key = name.toLowerCase()
    let place = cached(geocodeCache, key, GEOCODE_TTL_MS, nowMs)
    if (place === undefined) {
      const body = await getJson(`${GEOCODING_URL}?${new URLSearchParams({ name, count: '1', language: 'en', format: 'json' })}`, fetchFn)
      const hit = Array.isArray(body?.results) ? body.results[0] : null
      if (!hit) continue
      if (!Number.isFinite(hit.latitude) || !Number.isFinite(hit.longitude)) throw new ProviderError('failed')
      place = { name: String(hit.name ?? name), region: hit.admin1 ?? null, country: hit.country ?? null, latitude: hit.latitude, longitude: hit.longitude }
      geocodeCache.set(key, { at: nowMs, value: place })
    }
    return place
  }
  return null
}

async function fetchForecast(place, fetchFn, nowMs) {
  const key = `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}`
  const hit = forecastCache.get(key)
  if (hit && nowMs - hit.at < FORECAST_TTL_MS) return hit
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    hourly: 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m',
    timezone: 'auto',
    forecast_days: String(FORECAST_DAYS),
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
  })
  const body = await getJson(`${FORECAST_URL}?${params}`, fetchFn)
  const h = body?.hourly
  if (!h || !Array.isArray(h.time) || !Number.isFinite(body.utc_offset_seconds)) throw new ProviderError('failed')
  const entry = { at: nowMs, body }
  forecastCache.set(key, entry)
  return entry
}

const base = (status, eventStartAt, extra = {}) => ({ status, eventStartAt: eventStartAt?.toISOString() ?? null, location: null, forecast: null, fetchedAt: null, ...extra })
/** Weather for the event's destination at its (next) start time. Never throws for provider problems. */
export async function getEventWeather(userId, eventId, now = new Date(), fetchFn = (...a) => globalThis.fetch(...a)) {
  const event = await findOwnedEvent(userId, eventId) // 404 for a missing OR someone else's event
  let start = event.startAt
  if (event.isRecurring) {
    const horizon = new Date(now.getTime() + FORECAST_DAYS * 86_400_000)
    start = expandOccurrences(seriesOf(event), now, horizon, { max: 1 })[0] ?? event.startAt
  }

  const destination = event.destination?.trim()
  if (!destination) return base('no_location', start, { message: 'Add a destination to see the weather.' })
  if (start.getTime() < now.getTime() - HOUR) return base('forecast_unavailable', start, { reason: 'PAST', message: 'This event has already started.' })
  if (start.getTime() > now.getTime() + FORECAST_DAYS * 86_400_000) return base('forecast_unavailable', start, { reason: 'TOO_FAR', message: `Forecasts are available up to ${FORECAST_DAYS} days ahead.` })

  try {
    const place = await geocode(destination, fetchFn, now.getTime())
    if (!place) return base('location_not_found', start, { message: 'We could not find this destination. Try adding a city name.' })
    const location = { name: place.name, region: place.region, country: place.country }
    const { body, at } = await fetchForecast(place, fetchFn, now.getTime())
    const forecast = pickHour(body, start)
    if (!forecast) return base('forecast_unavailable', start, { reason: 'EMPTY', location, message: 'No forecast is available for this time yet.' })
    return base('ok', start, { location, forecast, fetchedAt: new Date(at).toISOString() })
  } catch (err) {
    if (err instanceof ProviderError) {
      return base(err.kind === 'timeout' ? 'timeout' : 'provider_unavailable', start, {
        message: err.kind === 'timeout' ? 'The weather service took too long to respond.' : 'Weather is temporarily unavailable.',
      })
    }
    throw err
  }
}
