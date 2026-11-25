import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookmarkPlus, CalendarPlus, Check, ChevronRight, LocateFixed, Loader2, MapPinned } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { Skeleton } from '@/components/common/LoadingSkeleton'
import { BangladeshMap } from '@/components/explore/BangladeshMap'
import { ExploreDestinations } from '@/components/explore/ExploreDestinations'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useForecast } from '@/hooks/useForecast'
import { useRemoteData } from '@/hooks/useRemoteData'
import { areaPath, boundsOfAll, loadDistricts, loadDivisions, loadUpazilas } from '@/lib/geo/boundaries'
import { boundsOf, findContaining } from '@/lib/geo/geometry'
import { formatTemp, loadUnit } from '@/lib/weatherLocation'
import { cn } from '@/lib/utils'
import { createPlace, getPlaces } from '@/services/packingApi'

const byName = (a, b) => a.properties.name.localeCompare(b.properties.name)
const GEO_MESSAGES = {
  1: 'Location permission was denied. You can still choose a division and district on the map.',
  2: 'Your device could not work out its location. You can still choose an area on the map.',
  3: 'Finding your location took too long. Try again, or choose an area on the map.',
}

/** One row of the list that mirrors the map (also the keyboard and screen-reader path to every area). */
function AreaButton({ feature, onPick }) {
  return (
    <li>
      <button type="button" onClick={() => onPick(feature)} className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-left text-sm font-semibold text-ink transition-colors hover:border-brand-200 hover:bg-brand-50">
        <span className="truncate">{feature.properties.name}</span>
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </button>
    </li>
  )
}

/** Weather, save and plan actions for the selected area (an area is a valid destination on its own). */
function AreaBar({ forecast, title, trail, savedHere }) {
  const [save, setSave] = useState({ state: 'idle', message: '' })
  const unit = loadUnit()
  const current = forecast.data?.status === 'ok' ? forecast.data.current : null
  const address = [title, trail].filter(Boolean).join(', ').slice(0, 255)

  const saveToPlaces = async () => {
    setSave({ state: 'saving', message: '' })
    try {
      await createPlace({ label: title.slice(0, 60), kind: 'other', address })
      setSave({ state: 'saved', message: 'Saved to your places.' })
    } catch (error) {
      setSave({ state: 'error', message: error.message })
    }
  }

  return (
    <section aria-label={`Selected area: ${title}`} className="space-y-3 rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
      <div>
        <h3 className="text-base font-bold text-ink">{title}</h3>
        {trail && <p className="text-sm text-muted">{trail}</p>}
      </div>
      <p className="text-sm">
        <span className="font-semibold">Weather: </span>
        {forecast.loading && !forecast.data ? 'Loading…' : current ? `${formatTemp(current.temperatureC, unit)}, ${current.condition}${current.rainChancePercent == null ? '' : `, ${current.rainChancePercent}% chance of rain`}` : 'Not available'}
        <span className="block text-xs text-muted">Forecast for the centre of this area. Travel time is not shown because ReadySet has no routing service.</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={saveToPlaces} disabled={save.state === 'saving' || save.state === 'saved'}>
          {save.state === 'saved' ? <Check className="size-4" /> : <BookmarkPlus className="size-4" />} {save.state === 'saved' ? 'Saved' : 'Save to my places'}
        </Button>
        <Link to={`/events/new?destination=${encodeURIComponent(address)}`} className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand-600 px-3.5 text-sm font-semibold text-white hover:bg-brand-700">
          <CalendarPlus className="size-4" /> Plan a departure here
        </Link>
      </div>
      {save.message && <p role={save.state === 'error' ? 'alert' : 'status'} className={cn('text-sm', save.state === 'error' ? 'text-rose-700' : 'text-accent-700')}>{save.message}</p>}
      {savedHere.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-ink">Your saved places that mention {title}</p>
          <ul className="mt-1 space-y-1 text-sm">
            {savedHere.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{p.label}{p.address ? <span className="text-muted"> · {p.address}</span> : null}</span>
                <Link to={`/events/new?destination=${encodeURIComponent(p.address || p.label)}`} className="shrink-0 text-xs font-semibold text-brand-700 hover:underline">Plan from here</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/**
 * Bangladesh → Division → District → Upazila → Destination, chosen on the map or from the list.
 * Selecting here never changes the user's saved weather location. Boundaries are static files loaded on demand;
 * destinations come from the existing nearby-places service around the centre of the chosen district / upazila.
 */
export function BangladeshExplorer({ departure = null }) {
  const [divisionId, setDivisionId] = useState(null)
  const [districtId, setDistrictId] = useState(null)
  const [upazilaId, setUpazilaId] = useState(null)
  const [point, setPoint] = useState(null) // the user's own position, only after they press "Use my location"
  const [pending, setPending] = useState(null) // a located point waiting for the district's upazilas to load
  const [geo, setGeo] = useState({ busy: false, message: '' })

  const divisions = useRemoteData(loadDivisions, [])
  const districts = useRemoteData(() => (divisions.data ? loadDistricts() : null), [Boolean(divisions.data)])
  const upazilas = useRemoteData(() => (districtId ? loadUpazilas(districtId) : null), [districtId])
  const saved = useRemoteData(() => getPlaces().catch(() => ({ places: [] })), [])

  const division = divisions.data?.find((f) => f.properties.id === divisionId) ?? null
  const district = districts.data?.find((f) => f.properties.id === districtId) ?? null
  const upazilaList = useMemo(() => (upazilas.data ?? []).filter((f) => f.properties.districtId === districtId).sort(byName), [upazilas.data, districtId])
  // After "Use my location": the upazila containing the located point is selected as soon as the district's upazilas are loaded.
  const located = pending && pending.districtId === districtId && !upazilaId ? findContaining(upazilaList, pending.latitude, pending.longitude) : null
  const activeUpazilaId = upazilaId ?? located?.properties.id ?? null
  const upazila = upazilaList.find((f) => f.properties.id === activeUpazilaId) ?? null
  const districtsHere = useMemo(() => (districts.data ?? []).filter((f) => f.properties.divisionId === divisionId).sort(byName), [districts.data, divisionId])

  const level = upazila ? 'upazila' : district ? 'district' : division ? 'division' : 'bangladesh'
  const selectedArea = upazila ?? district ?? division

  const everything = useMemo(() => boundsOfAll(divisions.data ?? []), [divisions.data])
  const fitTo = useMemo(() => (selectedArea ? boundsOf(selectedArea.geometry) : everything), [selectedArea, everything])

  const goTo = useCallback((next) => {
    setDivisionId(next.divisionId ?? null)
    setDistrictId(next.districtId ?? null)
    setUpazilaId(next.upazilaId ?? null)
    setPending(null)
  }, [])

  const pickArea = useCallback((feature) => {
    if (level === 'bangladesh') goTo({ divisionId: feature.properties.id })
    else if (level === 'division') goTo({ divisionId, districtId: feature.properties.id })
    else goTo({ divisionId, districtId, upazilaId: feature.properties.id })
  }, [level, divisionId, districtId, goTo])

  // Map layers for the current level.
  const layers = useMemo(() => {
    const all = divisions.data ?? []
    const dist = districts.data ?? []
    if (level === 'bangladesh') return { areas: all, context: dist, outline: null, selected: null }
    if (level === 'division') return { areas: districtsHere, context: all.filter((f) => f.properties.id !== divisionId), outline: division, selected: null }
    const siblings = dist.filter((f) => f.properties.divisionId === divisionId && f.properties.id !== districtId)
    return { areas: upazilaList, context: siblings, outline: district, selected: activeUpazilaId }
  }, [level, divisions.data, districts.data, districtsHere, division, district, divisionId, districtId, activeUpazilaId, upazilaList])

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setGeo({ busy: false, message: 'This browser cannot share a location. Choose an area on the map instead.' })
      return
    }
    setGeo({ busy: true, message: '' })
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude, longitude } = coords
        const div = findContaining(divisions.data ?? [], latitude, longitude)
        const dis = findContaining(districts.data ?? [], latitude, longitude)
        if (!div || !dis) {
          setGeo({ busy: false, message: districts.data ? 'Your location appears to be outside Bangladesh, so no area was selected.' : 'District boundaries are still loading. Try again in a moment.' })
          return
        }
        setPoint({ latitude, longitude })
        goTo({ divisionId: div.properties.id, districtId: dis.properties.id })
        setPending({ districtId: dis.properties.id, latitude, longitude }) // after goTo, which clears it
        setGeo({ busy: false, message: `You are in ${dis.properties.name} district.` })
      },
      (error) => setGeo({ busy: false, message: GEO_MESSAGES[error.code] ?? GEO_MESSAGES[2] }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }

  const crumbs = [
    { key: 'bd', label: 'Bangladesh', active: level === 'bangladesh', go: () => goTo({}) },
    division && { key: 'div', label: `${division.properties.name} Division`, active: level === 'division', go: () => goTo({ divisionId }) },
    district && { key: 'dis', label: district.properties.name, active: level === 'district', go: () => goTo({ divisionId, districtId }) },
    upazila && { key: 'upa', label: upazila.properties.name, active: true, go: () => {} },
  ].filter(Boolean)

  const loadFailed = divisions.error
  const title = selectedArea?.properties.name
  const trail = areaPath({ division: level === 'division' ? null : division, district: level === 'district' ? null : district, upazila: null })
  const target = selectedArea ? { latitude: selectedArea.properties.centre[0], longitude: selectedArea.properties.centre[1], name: title } : null
  const forecast = useForecast(target)
  const savedHere = useMemo(() => {
    if (!selectedArea) return []
    const needle = selectedArea.properties.name.toLowerCase()
    return (saved.data?.places ?? []).filter((p) => `${p.label} ${p.address ?? ''}`.toLowerCase().includes(needle)).slice(0, 5)
  }, [saved.data, selectedArea])

  const listTitle = level === 'bangladesh' ? 'Divisions' : level === 'division' ? `Districts in ${division.properties.name}` : `Upazilas in ${district.properties.name}`
  const listItems = level === 'bangladesh' ? [...(divisions.data ?? [])].sort(byName) : level === 'division' ? districtsHere : upazilaList

  const map = (extra = {}) => (
    <BangladeshMap
      areas={layers.areas}
      context={layers.context}
      outline={layers.outline}
      selectedAreaId={layers.selected}
      onPickArea={pickArea}
      fitTo={fitTo}
      point={point}
      ariaLabel={selectedArea ? `Map of ${title}` : 'Map of Bangladesh with its eight divisions'}
      {...extra}
    />
  )

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Explore Bangladesh</CardTitle>
          <CardDescription>Choose a division, then a district, on the map or from the list. Typing is optional.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={useMyLocation} disabled={geo.busy || !divisions.data}>
          {geo.busy ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />} Use my location
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <nav aria-label="Selected area" className="flex flex-wrap items-center gap-1 text-sm">
          {crumbs.map((c, i) => (
            <span key={c.key} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3.5 text-muted" aria-hidden="true" />}
              <button type="button" onClick={c.go} aria-current={c.active ? 'page' : undefined} className={cn('cursor-pointer rounded-lg px-2 py-1 font-semibold', c.active ? 'bg-brand-50 text-brand-700' : 'text-muted hover:text-brand-700')}>{c.label}</button>
            </span>
          ))}
        </nav>
        {geo.message && <p role="status" className="text-sm text-muted">{geo.message}</p>}

        {loadFailed ? (
          <Alert>
            The Bangladesh map could not be loaded. {loadFailed.message}{' '}
            <button type="button" onClick={divisions.reload} className="font-bold underline">Try again</button>
            <span className="block text-xs">You can still search for a place in the box on the left.</span>
          </Alert>
        ) : !divisions.data ? (
          <div role="status" aria-label="Loading the map"><Skeleton className="h-72 sm:h-96" /></div>
        ) : (
          <>
            {level === 'division' && districts.error && (
              <Alert>District boundaries could not be loaded. <button type="button" onClick={districts.reload} className="font-bold underline">Try again</button></Alert>
            )}
            {level === 'division' && !districts.data && !districts.error && <p role="status" className="text-sm text-muted">Loading districts…</p>}
            {level === 'district' && upazilas.error && (
              <Alert>Upazila boundaries could not be loaded; destinations below still work. <button type="button" onClick={upazilas.reload} className="font-bold underline">Try again</button></Alert>
            )}

            {level === 'division' && <AreaBar key={selectedArea.properties.id} forecast={forecast} title={title} trail={trail} savedHere={savedHere} />}

            {level === 'district' || level === 'upazila' ? (
              <>
                <div className="grid items-start gap-4 lg:grid-cols-2">
                  <AreaBar key={selectedArea.properties.id} forecast={forecast} title={title} trail={trail} savedHere={savedHere} />
                {upazilaList.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-ink">{listTitle}</p>
                    <ul className="flex max-h-44 flex-wrap gap-2 overflow-y-auto pr-1" aria-label={listTitle}>
                      {upazilaList.map((f) => (
                        <li key={f.properties.id}>
                          <button type="button" aria-pressed={f.properties.id === activeUpazilaId} onClick={() => pickArea(f)} className={cn('h-8 cursor-pointer rounded-full border px-3 text-xs font-semibold transition-colors', f.properties.id === activeUpazilaId ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-surface text-muted hover:border-brand-200')}>{f.properties.name}</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                </div>
                <ExploreDestinations
                  key={`${target.latitude},${target.longitude}`}
                  bare
                  location={target}
                  forecast={forecast.data}
                  departure={departure}
                  initialRadius={level === 'district' ? 10000 : 5000}
                  renderMap={({ places, selectedId, onSelect }) => map({ places, selectedPlaceId: selectedId, onSelectPlace: onSelect })}
                />
              </>
            ) : (
              <div className="grid gap-4 lg:grid-cols-5">
                <div className="min-w-0 lg:col-span-3">{map()}</div>
                <div className="min-w-0 lg:col-span-2">
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink"><MapPinned className="size-4 text-brand-600" aria-hidden="true" /> {listTitle}</p>
                  {listItems.length === 0 ? (
                    <p className="text-sm text-muted">{level === 'division' && districts.error ? 'Districts are unavailable right now.' : 'Loading…'}</p>
                  ) : (
                    <ul className="grid max-h-[26rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:max-h-[28rem] lg:grid-cols-1" aria-label={listTitle}>
                      {listItems.map((f) => <AreaButton key={f.properties.id} feature={f} onPick={pickArea} />)}
                    </ul>
                  )}
                </div>
              </div>
            )}
            <p className="text-xs text-muted">Boundaries: geoBoundaries (divisions CC0; districts and upazilas CC BY 3.0 IGO, from the Bangladesh Bureau of Statistics). Map © OpenStreetMap contributors.</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
