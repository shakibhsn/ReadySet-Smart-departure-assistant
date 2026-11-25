import L from 'leaflet'

// OpenStreetMap-compatible tiles. The public OSM tile server is for light use only (see its tile usage policy): for a
// production deployment with real traffic, set VITE_MAP_TILE_URL to a tile service you are allowed to use.
export const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'

// Markers are plain CSS dots (no image files, so nothing breaks under the bundler). Names are set with textContent,
// never as HTML: place names come from OpenStreetMap contributors and must never be interpreted as markup.
export const dot = (kind) => L.divIcon({ className: '', html: `<span class="rs-pin rs-pin-${kind}"></span>`, iconSize: [22, 22], iconAnchor: [11, 11] })
export const label = (text) => {
  const el = document.createElement('span')
  el.textContent = text
  return el
}
