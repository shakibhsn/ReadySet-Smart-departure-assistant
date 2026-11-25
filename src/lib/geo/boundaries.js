import { boundsOf } from '@/lib/geo/geometry'

// Administrative boundaries (geoBoundaries, see docs/EXPLORE_MAP.md) are static files under /geo, built by
// scripts/build-geo-data.mjs. Each file is fetched at most once; the heavy ones only when the user goes that deep.
const cache = new Map()

function load(path) {
  if (!cache.has(path)) {
    const request = fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error(`Map data could not be loaded (${res.status}).`)
        return res.json()
      })
      .then((json) => json.features)
      .catch((error) => {
        cache.delete(path) // a failure is never cached: "Try again" really retries
        throw error instanceof Error ? error : new Error('Map data could not be loaded.')
      })
    cache.set(path, request)
  }
  return cache.get(path)
}

export const loadDivisions = () => load('/geo/bd-divisions.json')
export const loadDistricts = () => load('/geo/bd-districts.json')
export const loadUpazilas = (districtId) => {
  if (!/^[A-Za-z0-9]+$/.test(districtId ?? '')) return Promise.reject(new Error('Unknown district.'))
  return load(`/geo/upazilas/${districtId}.json`)
}

/** Test helper: forget what was fetched. */
export const resetBoundaryCache = () => cache.clear()

/** Bounds covering every feature. */
export const boundsOfAll = (features) =>
  features.reduce((all, f) => {
    const b = boundsOf(f.geometry)
    if (!b) return all
    return all ? [[Math.min(all[0][0], b[0][0]), Math.min(all[0][1], b[0][1])], [Math.max(all[1][0], b[1][0]), Math.max(all[1][1], b[1][1])]] : b
  }, null)

/** "Savar, Dhaka, Dhaka Division" style text for the chain of selected areas (most specific first). */
export const areaPath = ({ division, district, upazila }) =>
  [upazila?.properties.name, district?.properties.name, division && `${division.properties.name} Division`].filter(Boolean).join(', ')
