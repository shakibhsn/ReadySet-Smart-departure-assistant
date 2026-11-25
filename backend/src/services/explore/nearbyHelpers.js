// PURE helpers for "Explore Destinations": category definitions, the Overpass (OpenStreetMap) query, and mapping of
// elements to destination cards. Only fields OpenStreetMap actually returned are used: no ratings, prices, opening hours
// or business details are ever invented (or even passed through).

export const CATEGORIES = {
  cafe: { label: 'Cafes', tags: [['amenity', 'cafe']] },
  restaurant: { label: 'Restaurants', tags: [['amenity', 'restaurant'], ['amenity', 'fast_food']] },
  park: { label: 'Parks', tags: [['leisure', 'park'], ['leisure', 'garden']] },
  attraction: { label: 'Tourist attractions', tags: [['tourism', 'attraction'], ['tourism', 'viewpoint'], ['tourism', 'zoo'], ['tourism', 'theme_park'], ['historic', 'monument'], ['historic', 'memorial']] },
  museum: { label: 'Museums', tags: [['tourism', 'museum'], ['tourism', 'gallery']] },
  shopping: { label: 'Shopping', tags: [['shop', 'mall'], ['shop', 'department_store'], ['shop', 'supermarket'], ['amenity', 'marketplace']] },
  nature: { label: 'Nature & outdoors', tags: [['natural', 'beach'], ['natural', 'peak'], ['natural', 'waterfall'], ['leisure', 'nature_reserve'], ['boundary', 'national_park']] },
  useful: { label: 'Nearby useful places', tags: [['amenity', 'hospital'], ['amenity', 'pharmacy'], ['amenity', 'bank'], ['amenity', 'fuel'], ['amenity', 'police']] },
}
export const CATEGORY_KEYS = Object.keys(CATEGORIES)
export const DEFAULT_RADIUS_M = 2500
export const MIN_RADIUS_M = 500
export const MAX_RADIUS_M = 10_000
export const RESULT_LIMIT = 40
const FETCH_LIMIT = 120 // asked from the provider; the nearest RESULT_LIMIT are kept

/** Round the search centre to ~1 km so nearby requests share one provider call (and one cache entry). */
export const cellOf = (lat, lon) => ({ lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 })

const esc = (s) => String(s).replace(/[^A-Za-z0-9_:-]/g, '') // tag keys/values come from our own table, but never trust a string into a query

/** category: one key of CATEGORIES, or 'all'. */
export function buildQuery({ lat, lon, radius, category }) {
  const keys = category === 'all' ? CATEGORY_KEYS : [category]
  const clauses = keys.flatMap((k) => CATEGORIES[k].tags.map(([key, value]) => `nwr(around:${Math.round(radius)},${lat},${lon})["${esc(key)}"="${esc(value)}"]["name"];`))
  return `[out:json][timeout:15];(${clauses.join('')});out center tags ${FETCH_LIMIT};`
}

/** Which of our categories does an OSM element belong to? (first match in table order) */
export function categoryOf(tags, only) {
  const keys = only && only !== 'all' ? [only] : CATEGORY_KEYS
  return keys.find((k) => CATEGORIES[k].tags.some(([key, value]) => tags?.[key] === value)) ?? null
}

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6_371_000
  const rad = (d) => (d * Math.PI) / 180
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

const clean = (v, max = 120) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** "House 5, Road 3, Gulshan, Dhaka" built ONLY from address tags that exist; null when there are none. */
export function addressOf(tags) {
  const street = [clean(tags['addr:housenumber'], 20), clean(tags['addr:street'])].filter(Boolean).join(' ')
  const parts = [street, clean(tags['addr:suburb']), clean(tags['addr:city'] ?? tags['addr:town'] ?? tags['addr:district'])].filter(Boolean)
  return parts.length > 0 ? [...new Set(parts)].join(', ') : null
}

export function mapElements(elements, { lat, lon, category }) {
  const out = []
  const seen = new Set()
  for (const el of Array.isArray(elements) ? elements : []) {
    const tags = el?.tags
    const name = clean(tags?.name)
    const plat = Number.isFinite(el?.lat) ? el.lat : el?.center?.lat
    const plon = Number.isFinite(el?.lon) ? el.lon : el?.center?.lon
    const cat = categoryOf(tags, category)
    if (!name || !cat || !Number.isFinite(plat) || !Number.isFinite(plon) || !['node', 'way', 'relation'].includes(el.type)) continue
    const id = `${el.type}/${el.id}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      name,
      category: cat,
      categoryLabel: CATEGORIES[cat].label,
      latitude: plat,
      longitude: plon,
      distanceMeters: Math.round(haversineMeters(lat, lon, plat, plon)),
      address: addressOf(tags),
      locality: clean(tags['addr:suburb'] ?? tags['addr:city'] ?? tags['addr:town'] ?? tags['addr:district']) || null,
      osmUrl: `https://www.openstreetmap.org/${id}`,
    })
  }
  return out.sort((a, b) => a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id)).slice(0, RESULT_LIMIT)
}
