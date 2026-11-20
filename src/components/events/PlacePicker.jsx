import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FormSelect } from '@/components/common/FormSelect'
import { getPlaces } from '@/services/packingApi'

/**
 * Fills the event's destination from one of the user's saved places (the address is COPIED into the event).
 * Optional: hidden when there are no places or they cannot be loaded.
 */
export function PlacePicker({ onPick }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    let cancelled = false
    getPlaces()
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData({ places: [], defaultStartPlaceId: null }))
    return () => { cancelled = true }
  }, [])

  if (!data || data.places.length === 0) return null
  const start = data.places.find((p) => p.isDefaultStart)

  return (
    <div className="sm:col-span-2">
      <FormSelect
        label="Saved places"
        placeholder="Choose a saved place…"
        options={data.places.map((p) => ({ value: p.id, label: `${p.label} — ${p.address}` }))}
        value=""
        onChange={(e) => {
          const place = data.places.find((p) => p.id === e.target.value)
          if (place) onPick(place.address)
        }}
        hint={start ? `Starting from: ${start.label} (your default). Picking a place copies its address into Destination.` : 'Picking a place copies its address into Destination.'}
      />
      <Link to="/places" className="mt-1 inline-block text-xs font-semibold text-brand-700 hover:underline">Manage saved places</Link>
    </div>
  )
}
