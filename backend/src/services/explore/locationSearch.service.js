import { createCache, getJson, unavailable } from './providerHttp.js'
import { mapResults } from './locationHelpers.js'

// Location search through the Open-Meteo Geocoding API (free, no key, not Nominatim). Bangladesh is the default scope.

export const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const cache = createCache({ ttlMs: 24 * 60 * 60 * 1000, max: 500 })
export const clearLocationCache = () => cache.clear()

/**
 * @param q       search text (already validated: 2..80 characters)
 * @param country 'BD' (default) restricts to Bangladesh; 'ANY' searches worldwide
 */
export async function searchLocations({ q, country = 'BD', count = 10 }, now = new Date(), fetchFn = (...a) => globalThis.fetch(...a)) {
  const key = `${country}|${count}|${q.toLowerCase()}`
  try {
    const results = await cache.memo(key, now.getTime(), async () => {
      const params = new URLSearchParams({ name: q, count: String(count), language: 'en', format: 'json', ...(country !== 'ANY' && { countryCode: country }) })
      const body = await getJson(`${GEOCODING_URL}?${params}`, fetchFn)
      return mapResults(body?.results) // a query with no match legitimately has no "results" field
    })
    return { status: 'ok', query: q, country, results }
  } catch (err) {
    return unavailable(err, { query: q, country, results: [] })
  }
}
