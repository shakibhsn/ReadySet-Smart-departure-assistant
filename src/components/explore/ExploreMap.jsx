import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ATTRIBUTION, dot, label, TILE_URL } from '@/components/explore/mapShared'

/**
 * Leaflet map: the chosen location (blue), the destinations (teal) and the selected destination (amber).
 * Zoom controls and drag are built in; clicking or pressing Enter on a marker selects that destination.
 */
export function ExploreMap({ center, places = [], selectedId = null, onSelect, className = '' }) {
  const host = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)

  useEffect(() => {
    const instance = L.map(host.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true }).setView([center.latitude, center.longitude], 14)
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(instance)
    layer.current = L.layerGroup().addTo(instance)
    map.current = instance
    return () => {
      instance.remove()
      map.current = null
      layer.current = null
    }
    // The map is created once; markers and the view are updated by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const instance = map.current
    if (!instance || !layer.current) return
    layer.current.clearLayers()
    const home = L.marker([center.latitude, center.longitude], { icon: dot('home'), keyboard: false, title: center.name })
    home.bindTooltip(label(`${center.name} (selected location)`))
    home.addTo(layer.current)
    const points = [[center.latitude, center.longitude]]
    for (const p of places) {
      const marker = L.marker([p.latitude, p.longitude], { icon: dot(p.id === selectedId ? 'selected' : 'place'), title: p.name, keyboard: true, zIndexOffset: p.id === selectedId ? 1000 : 0 })
      marker.bindTooltip(label(p.name))
      marker.on('click', () => onSelect?.(p.id))
      marker.on('keypress', (e) => e.originalEvent?.key === 'Enter' && onSelect?.(p.id))
      marker.addTo(layer.current)
      points.push([p.latitude, p.longitude])
    }
    if (points.length > 1) instance.fitBounds(points, { padding: [32, 32], maxZoom: 16 })
    else instance.setView(points[0], 14)
  }, [center.latitude, center.longitude, center.name, places, selectedId, onSelect])

  return (
    <div className={`relative isolate z-0 overflow-hidden rounded-[22px] border border-line shadow-card ${className}`}>
      <div ref={host} role="region" aria-label={`Map of places near ${center.name}`} className="h-72 w-full sm:h-96 lg:h-[28rem]" />
    </div>
  )
}
