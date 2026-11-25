// Small, dependency-free GeoJSON helpers (coordinates are [longitude, latitude], as in GeoJSON).
// Used by the data build script (scripts/build-geo-data.mjs) and by the Explore map.

/** The polygons of a Polygon / MultiPolygon geometry: [[outerRing, ...holes], ...]. */
export const polygonsOf = (geometry) => {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return [geometry.coordinates]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates
  return []
}

const ringContains = (ring, x, y) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Is the point inside the geometry (holes respected)? */
export const pointInGeometry = (lat, lon, geometry) =>
  polygonsOf(geometry).some(([outer, ...holes]) => ringContains(outer, lon, lat) && !holes.some((h) => ringContains(h, lon, lat)))

/** Leaflet-style bounds [[south, west], [north, east]] of a geometry, or null when it is empty. */
export const boundsOf = (geometry) => {
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity
  for (const [outer] of polygonsOf(geometry)) {
    for (const [x, y] of outer) {
      if (y < s) s = y
      if (y > n) n = y
      if (x < w) w = x
      if (x > e) e = x
    }
  }
  return Number.isFinite(s) ? [[s, w], [n, e]] : null
}

const ringArea = (ring) => {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  return a / 2
}

/** A point guaranteed to be inside the geometry: the centroid of the largest part, else the closest interior grid point. */
export const interiorPoint = (geometry) => {
  const parts = polygonsOf(geometry)
  if (parts.length === 0) return null
  const outer = parts.map((p) => p[0]).sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0]
  let cx = 0, cy = 0, area = 0
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const f = outer[j][0] * outer[i][1] - outer[i][0] * outer[j][1]
    cx += (outer[j][0] + outer[i][0]) * f
    cy += (outer[j][1] + outer[i][1]) * f
    area += f
  }
  const candidate = area === 0 ? outer[0] : [cx / (3 * area), cy / (3 * area)]
  if (pointInGeometry(candidate[1], candidate[0], geometry)) return [candidate[1], candidate[0]]
  const [[s, w], [n, e]] = boundsOf(geometry)
  let best = null, bestDistance = Infinity
  for (let i = 1; i < 40; i++) {
    for (let j = 1; j < 40; j++) {
      const lat = s + ((n - s) * i) / 40, lon = w + ((e - w) * j) / 40
      if (!pointInGeometry(lat, lon, geometry)) continue
      const d = (lon - candidate[0]) ** 2 + (lat - candidate[1]) ** 2
      if (d < bestDistance) { bestDistance = d; best = [lat, lon] }
    }
  }
  return best ?? [outer[0][1], outer[0][0]]
}

/** Round every coordinate (3 decimals is about 110 m) and drop consecutive duplicates, to keep files small. */
export const roundGeometry = (geometry, digits = 3) => {
  const k = 10 ** digits
  const ring = (r) => {
    const out = []
    for (const [x, y] of r) {
      const p = [Math.round(x * k) / k, Math.round(y * k) / k]
      const last = out[out.length - 1]
      if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p)
    }
    return out.length >= 4 ? out : null
  }
  const poly = (p) => {
    const [outer, ...holes] = p.map(ring)
    return outer ? [outer, ...holes.filter(Boolean)] : null
  }
  if (geometry.type === 'Polygon') return { type: 'Polygon', coordinates: poly(geometry.coordinates) }
  return { type: 'MultiPolygon', coordinates: geometry.coordinates.map(poly).filter(Boolean) }
}

/** The feature that contains the point, or null. */
export const findContaining = (features, lat, lon) => features.find((f) => pointInGeometry(lat, lon, f.geometry)) ?? null

const sq = (a, b) => (a - b) ** 2
/** Squared distance from a point to the nearest vertex of the geometry (only used to place border cases). */
export const vertexDistance = (lat, lon, geometry) => {
  let best = Infinity
  for (const [outer] of polygonsOf(geometry)) for (const [x, y] of outer) best = Math.min(best, sq(x, lon) + sq(y, lat))
  return best
}
