import { env } from '../../config/env.js'
import { buildQuery, cellOf, mapElements } from './nearbyHelpers.js'
import { createCache, getJson, ProviderError, unavailable } from './providerHttp.js'

// Nearby destinations from OpenStreetMap through Overpass API instances (OVERPASS_URL: one URL, or several separated by
// commas, tried in order). Public Overpass servers are shared, rate limited and sometimes slow (a tiny query has taken
// over 30 s on the main one), so: a short timeout PER server with fallback to the next, one category per request, a
// ~1 km grid + 30 minute cache, in-flight sharing, and a per-user request limiter on the route. For heavy production
// use, run your own Overpass instance (or use a hosted one) and point OVERPASS_URL at it.

export const OVERPASS_TIMEOUT_MS = 12_000 // per server
const cache = createCache({ ttlMs: 30 * 60 * 1000, max: 300 })
export const clearNearbyCache = () => cache.clear()

const endpointsOf = (value) => (Array.isArray(value) ? value : String(value).split(',').map((u) => u.trim()).filter(Boolean))

async function queryOverpass(endpoints, query, fetchFn) {
  let last = new ProviderError('failed')
  for (const url of endpoints) {
    try {
      const body = await getJson(url, fetchFn, {
        timeoutMs: OVERPASS_TIMEOUT_MS,
        // Overpass servers reject anonymous clients (HTTP 406): identify the application.
        init: { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ReadySet-Smart-Departure-Assistant/1.0' }, body: new URLSearchParams({ data: query }).toString() },
      })
      if (!Array.isArray(body?.elements)) throw new ProviderError('failed') // e.g. a "runtime error: query timed out" remark
      return body.elements
    } catch (err) {
      last = err instanceof ProviderError ? err : new ProviderError('failed')
    }
  }
  throw last // every server failed: report the last problem
}

export async function findNearby({ latitude, longitude, radius, category }, now = new Date(), fetchFn = (...a) => globalThis.fetch(...a), overpassUrl = env.OVERPASS_URL) {
  const cell = cellOf(latitude, longitude)
  const key = `${cell.lat},${cell.lon}|${radius}|${category}`
  try {
    // The provider result is cached per grid cell; distances are computed from the user's EXACT point on every request.
    const elements = await cache.memo(key, now.getTime(), () => queryOverpass(endpointsOf(overpassUrl), buildQuery({ lat: cell.lat, lon: cell.lon, radius, category }), fetchFn))
    return { status: 'ok', category, radiusMeters: radius, center: { latitude, longitude }, places: mapElements(elements, { lat: latitude, lon: longitude, category }), attribution: '© OpenStreetMap contributors (ODbL)' }
  } catch (err) {
    return unavailable(err, { category, radiusMeters: radius, places: [] })
  }
}
