import { useId, useState } from 'react'
import { LocateFixed, Loader2, MapPin, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useRemoteData } from '@/hooks/useRemoteData'
import { cn } from '@/lib/utils'
import { searchLocations } from '@/services/exploreApi'

const MIN_CHARS = 2
const SCOPES = [{ value: 'BD', label: 'Bangladesh' }, { value: 'ANY', label: 'Anywhere' }]

const toLocation = (place) => ({ name: place.name, area: place.area || null, country: place.country, latitude: place.latitude, longitude: place.longitude, source: 'search' })

const GEO_MESSAGES = {
  1: 'Location permission was denied. Search for a place above instead.',
  2: 'Your device could not work out its location. Search for a place above instead.',
  3: 'Finding your location took too long. Try again, or search for a place above.',
}

/**
 * Searchable location picker (Open-Meteo geocoding through the ReadySet API, Bangladesh first) with an optional
 * "use my current location" button that asks the browser for permission ONLY when it is clicked.
 */
export function LocationSearch({ selected, onSelect, onClear }) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('BD')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [geo, setGeo] = useState({ busy: false, message: '' })

  const text = query.trim()
  const debounced = useDebouncedValue(text, 400)
  const search = useRemoteData(() => (debounced.length >= MIN_CHARS ? searchLocations(debounced, { country: scope }) : null), [debounced, scope])

  const waiting = text.length >= MIN_CHARS && (text !== debounced || search.loading)
  const results = text.length >= MIN_CHARS && text === debounced && search.data?.status === 'ok' ? search.data.results : []
  const providerProblem = text.length >= MIN_CHARS && text === debounced && !search.loading && (search.error || (search.data && search.data.status !== 'ok'))
  const noResults = text.length >= MIN_CHARS && text === debounced && !search.loading && !providerProblem && results.length === 0

  const choose = (place) => {
    onSelect(toLocation(place))
    setQuery('')
    setOpen(false)
    setActive(0)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp' && results.length > 0) {
      e.preventDefault()
      setActive((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter' && open && results[active]) {
      e.preventDefault()
      choose(results[active])
    }
  }

  const useCurrent = () => {
    if (!navigator.geolocation) {
      setGeo({ busy: false, message: 'This browser cannot share your location. Search for a place above instead.' })
      return
    }
    setGeo({ busy: true, message: '' })
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setGeo({ busy: false, message: '' })
        onSelect({ name: 'My current location', area: `${coords.latitude.toFixed(2)}, ${coords.longitude.toFixed(2)}`, country: null, latitude: coords.latitude, longitude: coords.longitude, source: 'gps' })
      },
      (error) => setGeo({ busy: false, message: GEO_MESSAGES[error.code] ?? GEO_MESSAGES[2] }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }

  const showList = open && text.length >= MIN_CHARS

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Search area">
        {SCOPES.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={scope === s.value}
            onClick={() => setScope(s.value)}
            className={cn('h-8 cursor-pointer rounded-full border px-3 text-xs font-semibold transition-colors', scope === s.value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-surface text-muted hover:border-brand-200')}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <label htmlFor={`${listId}-input`} className="sr-only">Search for a place</label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          id={`${listId}-input`}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-opt-${active}` : undefined}
          autoComplete="off"
          maxLength={80}
          value={query}
          placeholder="Search a city, district, upazila or area (for example Savar, Sylhet, Cox's Bazar)"
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-10 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        {waiting && <Loader2 className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" aria-hidden="true" />}

        {showList && (
          <div className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-line bg-surface shadow-lift">
            {waiting && <p role="status" className="px-4 py-3 text-sm text-muted">Searching…</p>}
            {providerProblem && (
              <p role="alert" className="px-4 py-3 text-sm text-rose-700">
                {search.data?.message ?? search.error?.message ?? 'Search is unavailable right now.'}{' '}
                <button type="button" onClick={search.reload} className="font-bold underline">Try again</button>
              </p>
            )}
            {noResults && (
              <p role="status" className="px-4 py-3 text-sm text-muted">
                No places found for “{debounced}”{scope === 'BD' ? ' in Bangladesh' : ''}. Check the spelling, try a nearby town or district{scope === 'BD' ? ', or search anywhere' : ''}.
              </p>
            )}
            {results.length > 0 && (
              <ul id={listId} role="listbox" aria-label="Matching places">
                {results.map((p, i) => (
                  <li
                    key={p.id}
                    id={`${listId}-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(p)}
                    className={cn('flex cursor-pointer items-start gap-3 px-4 py-2.5', i === active && 'bg-brand-50')}
                  >
                    <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{p.name}{p.type && <span className="ml-2 text-xs font-medium text-muted">{p.type}</span>}</span>
                      {p.area && <span className="block truncate text-xs text-muted">{p.area}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={useCurrent} disabled={geo.busy}>
          {geo.busy ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />} Use my current location
        </Button>
        {selected && (
          <span className="inline-flex min-w-0 items-center gap-2 rounded-full bg-brand-50 py-0.5 pl-3 pr-0.5 text-sm text-brand-800">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate font-semibold">{selected.name}</span>
            <button type="button" onClick={onClear} aria-label="Clear selected location" className="flex size-8 cursor-pointer items-center justify-center rounded-full hover:bg-brand-100">
              <X className="size-3.5" />
            </button>
          </span>
        )}
      </div>
      {geo.message && <p role="alert" className="text-sm text-rose-700">{geo.message}</p>}
      <p className="text-xs text-muted">Place names come from Open-Meteo geocoding; coverage of very small villages can be incomplete.</p>
    </div>
  )
}
