import { buildForecast, FORECAST_PARAMS } from './forecastHelpers.js'
import { createCache, getJson, ProviderError, unavailable } from './providerHttp.js'

// Weather for a chosen location (Open-Meteo Forecast API: free, no key). Only the coordinates are sent to the provider.
// Cached for 10 minutes per ~1 km cell. If the provider fails, a forecast loaded within the last 3 hours is shown,
// clearly marked `stale` with the time it was loaded; older than that, the user just sees "unavailable".

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const FRESH_MS = 10 * 60 * 1000
export const STALE_LIMIT_MS = 3 * 60 * 60 * 1000
const cache = createCache({ ttlMs: FRESH_MS, max: 300 })
export const clearForecastCache = () => cache.clear()

const keyOf = (lat, lon) => `${lat.toFixed(2)},${lon.toFixed(2)}`

export async function getLocationForecast({ latitude, longitude }, now = new Date(), fetchFn = (...a) => globalThis.fetch(...a)) {
  const key = keyOf(latitude, longitude)
  const nowMs = now.getTime()
  try {
    const entry = await cache.memo(key, nowMs, async () => {
      const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), ...FORECAST_PARAMS })
      const body = await getJson(`${FORECAST_URL}?${params}`, fetchFn)
      try {
        return { loadedAt: nowMs, forecast: buildForecast(body) }
      } catch {
        throw new ProviderError('failed') // a reply that is not a forecast counts as a provider failure
      }
    })
    return ok(entry, latitude, longitude, false)
  } catch (err) {
    const old = cache.peek(key)
    if (old && nowMs - old.value.loadedAt <= STALE_LIMIT_MS) return ok(old.value, latitude, longitude, true)
    return unavailable(err, { location: { latitude, longitude } })
  }
}

const ok = (entry, latitude, longitude, stale) => ({
  status: 'ok',
  location: { latitude, longitude },
  ...entry.forecast,
  fetchedAt: new Date(entry.loadedAt).toISOString(),
  stale,
  ...(stale && { message: 'The weather service is not responding. This is the last forecast we could load, not a current one.' }),
})
