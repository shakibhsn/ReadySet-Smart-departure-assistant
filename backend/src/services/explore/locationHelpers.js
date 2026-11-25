// PURE helpers for location search (Open-Meteo Geocoding API, GeoNames data). No network, no clock.

// GeoNames feature codes -> a human label. Unknown codes simply have no type (we never guess one).
const TYPE_LABELS = {
  PPLC: 'Capital city',
  PPLA: 'Division capital',
  PPLA2: 'District seat',
  PPLA3: 'Upazila seat',
  PPLA4: 'Local administrative seat',
  PPLA5: 'Local administrative seat',
  PPL: 'Town or village',
  PPLX: 'Neighbourhood',
  PPLL: 'Locality',
  PPLS: 'Settlements',
  PPLF: 'Farm village',
  PPLH: 'Historical settlement',
  ADM1: 'Division',
  ADM2: 'District',
  ADM3: 'Upazila',
  ADM4: 'Union',
  ADM5: 'Local area',
  PCLI: 'Country',
  AIRP: 'Airport',
  RGN: 'Region',
}
export const typeLabelOf = (featureCode) => TYPE_LABELS[featureCode] ?? null

export const SEARCH_COUNTRIES = { BD: 'Bangladesh', ANY: 'Anywhere' }

const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 120) : '')
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Parts that tell two same-named places apart: upazila, district, division, country (no repeats, never the name itself). */
export function areaParts(hit) {
  const name = clean(hit.name).toLowerCase()
  const seen = new Set([name])
  const out = []
  for (const part of [hit.admin4, hit.admin3, hit.admin2, hit.admin1, hit.country]) {
    const p = clean(part)
    if (p && !seen.has(p.toLowerCase())) {
      seen.add(p.toLowerCase())
      out.push(p)
    }
  }
  return out
}

/** One provider hit -> the public shape, or null if it has no usable coordinates. */
export function mapHit(hit) {
  const latitude = num(hit?.latitude)
  const longitude = num(hit?.longitude)
  const name = clean(hit?.name)
  if (!name || latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  const parts = areaParts(hit)
  return {
    id: String(hit.id ?? `${latitude.toFixed(4)},${longitude.toFixed(4)}`),
    name,
    admin1: clean(hit.admin1) || null, // division
    admin2: clean(hit.admin2) || null, // district
    admin3: clean(hit.admin3) || null, // upazila / thana
    admin4: clean(hit.admin4) || null,
    country: clean(hit.country) || null,
    countryCode: typeof hit.country_code === 'string' ? hit.country_code.toUpperCase() : null,
    latitude,
    longitude,
    timezone: clean(hit.timezone) || null,
    type: typeLabelOf(hit.feature_code),
    population: num(hit.population),
    area: parts.join(', '), // "Savar, Dhaka, Dhaka Division, Bangladesh": what the user sees under the name
  }
}

/** Maps and de-duplicates provider results (same id, or same name at the same spot). Keeps the provider's order. */
export function mapResults(results) {
  const seen = new Set()
  const out = []
  for (const hit of Array.isArray(results) ? results : []) {
    const place = mapHit(hit)
    if (!place) continue
    const key = `${place.name.toLowerCase()}|${place.latitude.toFixed(3)},${place.longitude.toFixed(3)}`
    if (seen.has(place.id) || seen.has(key)) continue
    seen.add(place.id)
    seen.add(key)
    out.push(place)
  }
  return out
}
