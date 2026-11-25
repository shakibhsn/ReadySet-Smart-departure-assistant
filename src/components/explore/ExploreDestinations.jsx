import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, BookmarkPlus, CalendarPlus, Check, ExternalLink, Lightbulb, MapPinOff, X } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { EmptyState } from '@/components/common/EmptyState'
import { Skeleton } from '@/components/common/LoadingSkeleton'
import { DestinationCard } from '@/components/explore/DestinationCard'
import { ExploreMap } from '@/components/explore/ExploreMap'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useRemoteData } from '@/hooks/useRemoteData'
import { conditionsFor, EXPLORE_CATEGORIES, filterByCategory, fitFor, formatDistance, hourAt } from '@/lib/exploreRules'
import { formatTemp, loadUnit } from '@/lib/weatherLocation'
import { cn } from '@/lib/utils'
import { getNearbyPlaces } from '@/services/exploreApi'
import { createPlace } from '@/services/packingApi'

const RADII = [{ value: 1000, label: '1 km' }, { value: 2500, label: '2.5 km' }, { value: 5000, label: '5 km' }, { value: 10000, label: '10 km' }]
const NA = 'Not available'

const destinationText = (p) => [p.name, p.address ?? p.locality].filter(Boolean).join(', ').slice(0, 255)

function Details({ place, hour, whenLabel, locationName, onClose }) {
  const [save, setSave] = useState({ state: 'idle', message: '' })
  const unit = loadUnit()

  const saveToPlaces = async () => {
    setSave({ state: 'saving', message: '' })
    try {
      await createPlace({ label: place.name.slice(0, 60), kind: 'other', address: destinationText(place) })
      setSave({ state: 'saved', message: 'Saved to your places.' })
    } catch (error) {
      setSave({ state: 'error', message: error.message })
    }
  }

  return (
    <section aria-label={`Details for ${place.name}`} className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-ink">{place.name}</h3>
          <p className="text-sm text-muted">{place.categoryLabel} · {formatDistance(place.distanceMeters)} from {locationName}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close details"><X className="size-4" /></Button>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        <div><dt className="inline text-muted">Address: </dt><dd className="inline font-medium">{place.address ?? NA}</dd></div>
        <div><dt className="inline text-muted">Area: </dt><dd className="inline font-medium">{place.locality ?? NA}</dd></div>
        <div><dt className="inline text-muted">Coordinates: </dt><dd className="inline font-medium">{place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}</dd></div>
        <div><dt className="inline text-muted">Opening hours, ratings, prices: </dt><dd className="inline font-medium">{NA}</dd></div>
      </dl>
      <p className="mt-3 text-sm">
        <span className="font-semibold">Weather nearby ({whenLabel}): </span>
        {hour ? `${formatTemp(hour.temperatureC, unit)}, ${hour.condition}${hour.rainChancePercent === null ? '' : `, ${hour.rainChancePercent}% chance of rain`}` : NA}
        <span className="block text-xs text-muted">From the forecast for {locationName}; it is not measured at this exact spot.</span>
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={saveToPlaces} disabled={save.state === 'saving' || save.state === 'saved'}>
          {save.state === 'saved' ? <Check className="size-4" /> : <BookmarkPlus className="size-4" />} {save.state === 'saved' ? 'Saved' : 'Save to my places'}
        </Button>
        <Link to={`/events/new?destination=${encodeURIComponent(destinationText(place))}`} className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand-600 px-3.5 text-sm font-semibold text-white hover:bg-brand-700">
          <CalendarPlus className="size-4" /> Plan a departure here
        </Link>
        <a href={place.osmUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">
          <ExternalLink className="size-4" /> OpenStreetMap
        </a>
      </div>
      {save.message && <p role={save.state === 'error' ? 'alert' : 'status'} className={cn('mt-2 text-sm', save.state === 'error' ? 'text-rose-700' : 'text-accent-700')}>{save.message}</p>}
    </section>
  )
}

/**
 * "Explore Destinations": nearby places from OpenStreetMap with category filters, a Leaflet map, weather-aware hints
 * and actions. `forecast` is the reply for the same location (or null); `departure` is { at, title } of the user's
 * next planned departure (or null). Without a forecast value for a time, no weather claim is made.
 */
export function ExploreDestinations({ location, forecast, departure, initialCategory = 'all' }) {
  const [category, setCategory] = useState(initialCategory)
  const [radius, setRadius] = useState(2500)
  const [when, setWhen] = useState('now')
  const [selectedId, setSelectedId] = useState(null)

  const nearby = useRemoteData(
    () => getNearbyPlaces({ latitude: location.latitude, longitude: location.longitude, radius, category }),
    [location.latitude, location.longitude, radius, category],
  )
  const ok = nearby.data?.status === 'ok'
  const failed = Boolean(nearby.error || (nearby.data && !ok))
  const initialLoading = nearby.loading && !nearby.data // the map shows at once; only the list waits
  const places = filterByCategory(ok ? nearby.data.places : [], category)
  const selected = places.find((p) => p.id === selectedId) ?? null

  const useDeparture = when === 'departure' && departure
  const hour = hourAt(forecast, useDeparture ? departure.at : 'now')
  const whenLabel = useDeparture ? `around your departure for ${departure.title}` : 'now'
  const conditions = conditionsFor(hour)
  const select = useCallback((id) => setSelectedId(id), [])

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Explore destinations</CardTitle>
          <CardDescription>Places near {location.name}, from OpenStreetMap.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by category">
          {EXPLORE_CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={category === c.value}
              onClick={() => setCategory(c.value)}
              className={cn('h-8 cursor-pointer rounded-full border px-3 text-xs font-semibold transition-colors', category === c.value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-surface text-muted hover:border-brand-200')}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-muted">Within</span>
            <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="h-9 cursor-pointer rounded-lg border border-line bg-surface px-2 text-sm font-medium">
              {RADII.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          {departure && (
            <label className="flex items-center gap-2">
              <span className="text-muted">Weather for</span>
              <select value={when} onChange={(e) => setWhen(e.target.value)} className="h-9 cursor-pointer rounded-lg border border-line bg-surface px-2 text-sm font-medium">
                <option value="now">Now</option>
                <option value="departure">My next departure ({departure.title})</option>
              </select>
            </label>
          )}
        </div>

        {conditions.reason ? (
          <p role={conditions.mode === 'advisory' ? 'alert' : 'status'} className={cn('flex items-start gap-2 rounded-xl p-3 text-sm', conditions.mode === 'advisory' ? 'bg-rose-50 font-medium text-rose-700' : 'bg-accent-50 text-accent-700')}>
            {conditions.mode === 'advisory' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <Lightbulb className="mt-0.5 size-4 shrink-0" />}
            <span>{conditions.reason}</span>
          </p>
        ) : (
          !hour && <p className="text-xs text-muted">Weather-based suggestions are not shown because the forecast is not available{useDeparture ? ' for that time' : ''}.</p>
        )}

        <>
            {failed && (
              <Alert>
                {nearby.data?.message ?? nearby.error?.message ?? 'Nearby places are unavailable right now.'}{' '}
                <button type="button" onClick={nearby.reload} className="font-bold underline">Try again</button>
              </Alert>
            )}
            {/* The map always shows the chosen location, even when the places could not be loaded. */}
            <ExploreMap center={{ latitude: location.latitude, longitude: location.longitude, name: location.name }} places={places} selectedId={selected?.id ?? null} onSelect={select} />
            {initialLoading ? (
              <div role="status" aria-label="Loading destinations" className="space-y-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : failed ? null : places.length === 0 ? (
              <EmptyState icon={MapPinOff} title="No places found here" description="OpenStreetMap has no named places for this filter within the chosen distance. Try a larger distance or another category." className="py-8" />
            ) : (
              <>
                <p className="text-sm text-muted" aria-live="polite">{places.length} {places.length === 1 ? 'place' : 'places'}, nearest first{places.length >= 40 ? ' (showing the nearest 40)' : ''}.</p>
                <ul className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2" aria-label="Destinations">
                  {places.map((p) => (
                    <DestinationCard key={p.id} place={p} selected={p.id === selected?.id} onSelect={select} fit={fitFor(conditions.mode, p.category)} />
                  ))}
                </ul>
              </>
            )}
            {selected && <Details place={selected} hour={hour} whenLabel={whenLabel} locationName={location.name} onClose={() => setSelectedId(null)} />}
            {!failed && !initialLoading && <p className="text-xs text-muted">Place data © OpenStreetMap contributors (ODbL). Opening hours, ratings and prices are not shown because they are not provided here.</p>}
        </>
      </CardContent>
    </Card>
  )
}
