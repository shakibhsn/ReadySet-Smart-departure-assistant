import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ATTRIBUTION, dot, label, TILE_URL } from '@/components/explore/mapShared'
import { mapColors } from '@/lib/geo/mapColors'

// Keep panning inside Bangladesh and its surroundings.
const MAX_BOUNDS = [[19.5, 86.5], [28.5, 94.5]]

/**
 * Interactive administrative map (Leaflet).
 *  - `areas`: the clickable boundaries of the current level (divisions, districts or upazilas).
 *  - `context`: other boundaries drawn faintly for orientation (not clickable).
 *  - `outline`: the boundary of the selected parent area, drawn with a strong line.
 *  - `selectedAreaId`: the clicked area, filled with lime.
 *  - `fitTo`: Leaflet bounds the view is moved to whenever it changes.
 *  - `places` / `selectedPlaceId`: destination markers; `point`: the user's own location, if they shared it.
 * Names are set with textContent (never as HTML).
 */
export function BangladeshMap({ areas = [], context = [], outline = null, selectedAreaId = null, onPickArea, fitTo, places = [], selectedPlaceId = null, onSelectPlace, point = null, className = '', ariaLabel = 'Map of Bangladesh' }) {
  const host = useRef(null)
  const map = useRef(null)
  const group = useRef(null)

  useEffect(() => {
    const instance = L.map(host.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true, minZoom: 6, maxBounds: MAX_BOUNDS, maxBoundsViscosity: 0.8 }).setView([23.7, 90.35], 7)
    L.tileLayer(TILE_URL, { maxZoom: 18, attribution: `${ATTRIBUTION} · Boundaries: <a href="https://www.geoboundaries.org" target="_blank" rel="noopener noreferrer">geoBoundaries</a> (CC BY 3.0 IGO)` }).addTo(instance)
    group.current = L.layerGroup().addTo(instance)
    map.current = instance
    return () => {
      instance.remove()
      map.current = null
      group.current = null
    }
  }, [])

  // Boundaries and markers.
  useEffect(() => {
    const layer = group.current
    if (!layer) return
    layer.clearLayers()
    const c = mapColors()

    for (const f of context) L.geoJSON(f, { interactive: false, style: { color: c.muted, weight: 0.8, opacity: 0.55, fillOpacity: 0 } }).addTo(layer)

    for (const f of areas) {
      const selected = f.properties.id === selectedAreaId
      const base = { color: selected ? c.deep : c.brand, weight: selected ? 2.5 : 1.2, fillColor: selected ? c.lime : c.lavender, fillOpacity: selected ? 0.55 : 0.28 }
      const shape = L.geoJSON(f, { style: base })
      shape.bindTooltip(label(f.properties.name), { sticky: true })
      shape.on('mouseover', () => shape.setStyle({ fillOpacity: 0.55, weight: 2 }))
      shape.on('mouseout', () => shape.setStyle(base))
      shape.on('click', () => onPickArea?.(f))
      shape.addTo(layer)
    }

    if (outline) L.geoJSON(outline, { interactive: false, style: { color: c.deep, weight: 3, fillOpacity: 0 } }).addTo(layer)

    for (const p of places) {
      const marker = L.marker([p.latitude, p.longitude], { icon: dot(p.id === selectedPlaceId ? 'selected' : 'place'), title: p.name, keyboard: true, zIndexOffset: p.id === selectedPlaceId ? 1000 : 0 })
      marker.bindTooltip(label(p.name))
      marker.on('click', () => onSelectPlace?.(p.id))
      marker.on('keypress', (e) => e.originalEvent?.key === 'Enter' && onSelectPlace?.(p.id))
      marker.addTo(layer)
    }
    if (point) L.marker([point.latitude, point.longitude], { icon: dot('home'), keyboard: false, title: 'Your location' }).bindTooltip(label('Your location')).addTo(layer)
  }, [areas, context, outline, selectedAreaId, onPickArea, places, selectedPlaceId, onSelectPlace, point])

  // Move the view only when the area changes (not when a marker is picked).
  useEffect(() => {
    if (map.current && fitTo) map.current.fitBounds(fitTo, { padding: [16, 16], animate: false })
  }, [fitTo])

  return (
    <div className={`relative isolate z-0 overflow-hidden rounded-[22px] border border-line shadow-card ${className}`}>
      <div ref={host} role="region" aria-label={ariaLabel} className="h-72 w-full sm:h-96 lg:h-[28rem]" />
    </div>
  )
}
