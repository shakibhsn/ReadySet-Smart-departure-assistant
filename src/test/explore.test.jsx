import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LocationSearch } from '@/components/explore/LocationSearch'
import { ExploreDestinations } from '@/components/explore/ExploreDestinations'
import { ForecastView, LocationWeatherCard } from '@/components/weather/LocationWeatherCard'
import { AuthContext } from '@/lib/authContext'
import { advisoryFor, conditionsFor, filterByCategory, fitFor, formatDistance, hourAt, localHourKey } from '@/lib/exploreRules'
import { clearLocation, formatTemp, loadLocation, loadUnit, normalizeLocation, saveLocation, saveUnit, toFahrenheit } from '@/lib/weatherLocation'
import { useWeatherLocation } from '@/hooks/useWeatherLocation'
import ExplorePage from '@/pages/explore/ExplorePage'
import { getForecast, getNearbyPlaces, searchLocations } from '@/services/exploreApi'
import { getUpcomingPlans } from '@/services/departureApi'
import { createPlace } from '@/services/packingApi'

vi.mock('@/services/exploreApi', () => ({ getForecast: vi.fn(), getNearbyPlaces: vi.fn(), searchLocations: vi.fn() }))
vi.mock('@/services/packingApi', () => ({ createPlace: vi.fn() }))
vi.mock('@/services/departureApi', () => ({ getUpcomingPlans: vi.fn() }))
// Leaflet needs a real browser layout: the map has its own test below, everything else uses a light stand-in.
vi.mock('@/components/explore/ExploreMap', () => ({
  ExploreMap: ({ places, selectedId, onSelect }) => (
    <div data-testid="map" data-selected={selectedId ?? ''}>
      {places.map((p) => <button key={p.id} type="button" onClick={() => onSelect(p.id)}>{`marker ${p.name}`}</button>)}
    </div>
  ),
}))

// ---------------- fixtures ----------------
const hour = (time, over = {}) => ({ time, temperatureC: 30, feelsLikeC: 34, rainChancePercent: 10, windSpeedKmh: 10, condition: 'Partly cloudy', icon: 'partly-cloudy', severeCondition: false, ...over })
const forecast = (over = {}) => ({
  status: 'ok', stale: false, fetchedAt: new Date().toISOString(), timezone: 'Asia/Dhaka', location: { latitude: 23.81, longitude: 90.41 },
  current: { time: '2030-05-10T14:15', temperatureC: 31, feelsLikeC: 36, humidityPercent: 74, windSpeedKmh: 14, precipitationMm: 0, rainChancePercent: 20, isDay: true, condition: 'Partly cloudy', icon: 'partly-cloudy', severeCondition: false },
  today: { minC: 26, maxC: 33, rainChancePercent: 40, sunrise: '2030-05-10T05:22', sunset: '2030-05-10T18:21' },
  hourly: Array.from({ length: 24 }, (_, i) => hour(`2030-05-10T${String((14 + i) % 24).padStart(2, '0')}:00`)).map((h, i) => (i < 10 ? h : { ...h, time: `2030-05-11T${String((14 + i) % 24).padStart(2, '0')}:00` })),
  daily: Array.from({ length: 7 }, (_, i) => ({ date: `2030-05-${10 + i}`, minC: 25, maxC: 33, rainChancePercent: 30, windMaxKmh: 20, sunrise: null, sunset: null, condition: 'Rain', icon: 'rain', severeCondition: false })),
  advice: [], ...over,
})
const place = (over = {}) => ({ id: 'node/1', name: 'Sea View Cafe', category: 'cafe', categoryLabel: 'Cafes', latitude: 23.811, longitude: 90.412, distanceMeters: 420, address: '12 Road 5, Gulshan', locality: 'Gulshan', osmUrl: 'https://www.openstreetmap.org/node/1', ...over })
const here = { name: 'Savar', area: 'Dhaka, Dhaka Division, Bangladesh', latitude: 23.85, longitude: 90.26, country: 'Bangladesh', source: 'search' }
const wrap = (ui, user = { id: 'user-a' }) => render(<MemoryRouter><AuthContext.Provider value={{ user }}>{ui}</AuthContext.Provider></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  getUpcomingPlans.mockResolvedValue({ plans: [] })
})
afterEach(() => vi.useRealTimers())

// ---------------- recommendation rules ----------------
describe('weather-aware recommendation rules', () => {
  it('converts an instant to the forecast hour of the PLACE, not of the browser', () => {
    expect(localHourKey('2030-05-10T08:30:00Z', 'Asia/Dhaka')).toBe('2030-05-10T14:00')
    expect(localHourKey('2030-05-10T20:10:00Z', 'Asia/Dhaka')).toBe('2030-05-11T02:00') // crosses midnight
    expect(localHourKey('nonsense', 'Asia/Dhaka')).toBeNull()
    expect(localHourKey('2030-05-10T08:30:00Z', 'Not/AZone')).toBeNull()
  })
  it('finds the forecast hour for now and for a departure time, and says nothing when it is not covered', () => {
    const f = forecast()
    expect(hourAt(f, 'now').time).toBe('2030-05-10T14:00')
    expect(hourAt(f, '2030-05-10T09:20:00Z').time).toBe('2030-05-10T15:00')
    expect(hourAt(f, '2030-06-30T09:20:00Z')).toBeNull() // beyond the forecast
    expect(hourAt({ status: 'provider_unavailable' }, 'now')).toBeNull()
    expect(hourAt(null)).toBeNull()
  })
  it('high rain chance -> indoor suggestion with the real number as the reason', () => {
    const c = conditionsFor(hour('t', { rainChancePercent: 80, icon: 'rain', condition: 'Rain' }))
    expect(c.mode).toBe('indoor')
    expect(c.reason).toBe('Rain is likely around that time (80% chance). Consider an indoor destination.')
  })
  it('severe weather or strong wind -> advisory (and never a safety claim)', () => {
    expect(conditionsFor(hour('t', { severeCondition: true, condition: 'Thunderstorm', icon: 'thunder' })).mode).toBe('advisory')
    const wind = conditionsFor(hour('t', { windSpeedKmh: 65 }))
    expect(wind.mode).toBe('advisory')
    expect(wind.reason).toMatch(/strong wind \(65 km\/h\)/)
    for (const mode of ['advisory', 'indoor', 'outdoor']) expect(JSON.stringify([conditionsFor(hour('t')), fitFor(mode, 'park'), fitFor(mode, 'cafe')])).not.toMatch(/\b(safe|guarantee|definitely|dry)\b/i)
  })
  it('pleasant weather -> outdoor suggestion; heat -> indoor; borderline -> no claim', () => {
    expect(conditionsFor(hour('t')).mode).toBe('outdoor')
    expect(conditionsFor(hour('t', { temperatureC: 36 })).mode).toBe('indoor')
    expect(conditionsFor(hour('t', { temperatureC: 10 })).mode).toBe('neutral')
    expect(conditionsFor(hour('t', { rainChancePercent: 35 })).mode).toBe('neutral')
  })
  it('no forecast hour -> no weather claim at all', () => {
    expect(conditionsFor(null)).toEqual({ mode: 'unavailable', reason: null })
    expect(conditionsFor(hour('t', { temperatureC: null, rainChancePercent: null, windSpeedKmh: null, icon: 'unknown' })).mode).toBe('neutral')
  })
  it('categories fit the conditions: indoor suits rain, outdoor suits nice weather, outdoor gets a caution in rain', () => {
    expect(fitFor('indoor', 'museum').fit).toBe('suits')
    expect(fitFor('indoor', 'park').fit).toBe('caution')
    expect(fitFor('outdoor', 'park').fit).toBe('suits')
    expect(fitFor('outdoor', 'cafe').fit).toBeNull()
    expect(fitFor('advisory', 'nature').fit).toBe('caution')
    expect(fitFor('unavailable', 'park').fit).toBeNull()
    expect(fitFor('indoor', 'useful').fit).toBeNull()
  })
  it('advisory for the planned departure time: severe -> warning, 70%+ rain -> info, otherwise none', () => {
    expect(advisoryFor(hour('t', { severeCondition: true, condition: 'Heavy rain' })).severity).toBe('warning')
    expect(advisoryFor(hour('t', { rainChancePercent: 75 }))).toMatchObject({ severity: 'info', message: expect.stringContaining('75%') })
    expect(advisoryFor(hour('t'))).toBeNull()
    expect(advisoryFor(null)).toBeNull()
  })
  it('filters by category and formats distance', () => {
    const list = [place(), place({ id: 'n2', category: 'park' })]
    expect(filterByCategory(list, 'all')).toHaveLength(2)
    expect(filterByCategory(list, 'park').map((p) => p.id)).toEqual(['n2'])
    expect(formatDistance(420)).toBe('420 m')
    expect(formatDistance(1540)).toBe('1.5 km')
  })
})

// ---------------- location preference persistence ----------------
describe('location preference persistence', () => {
  it('saves per user and survives a reload (a new read)', () => {
    saveLocation('user-a', here)
    expect(loadLocation('user-a')).toMatchObject({ name: 'Savar', latitude: 23.85, longitude: 90.26, source: 'search' })
  })
  it("one user's choice is never shown to another user on the same browser", () => {
    saveLocation('user-a', here)
    expect(loadLocation('user-b')).toBeNull()
    expect(loadLocation(null)).toBeNull()
  })
  it('can be changed and cleared', () => {
    saveLocation('user-a', here)
    saveLocation('user-a', { ...here, name: 'Sylhet', latitude: 24.9, longitude: 91.87 })
    expect(loadLocation('user-a').name).toBe('Sylhet')
    clearLocation('user-a')
    expect(loadLocation('user-a')).toBeNull()
  })
  it('ignores malformed or tampered values', () => {
    expect(normalizeLocation({ name: 'X', latitude: 91, longitude: 0 })).toBeNull()
    expect(normalizeLocation({ name: '', latitude: 1, longitude: 1 })).toBeNull()
    expect(normalizeLocation({ name: 'X', latitude: '23', longitude: 90 })).toBeNull()
    expect(normalizeLocation('nope')).toBeNull()
    window.localStorage.setItem('readyset.weatherLocation.v1:user-a', '{not json')
    expect(loadLocation('user-a')).toBeNull()
    window.localStorage.setItem('readyset.weatherLocation.v1:user-a', JSON.stringify({ name: 'X', latitude: 500, longitude: 0 }))
    expect(loadLocation('user-a')).toBeNull()
  })
  it('does not crash when storage is blocked (the choice just is not remembered)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => saveLocation('user-a', here)).not.toThrow()
    spy.mockRestore()
  })
  it('remembers the temperature unit and converts exactly', () => {
    expect(loadUnit()).toBe('C')
    saveUnit('F')
    expect(loadUnit()).toBe('F')
    expect(toFahrenheit(0)).toBe(32)
    expect(toFahrenheit(31)).toBe(88)
    expect(formatTemp(null)).toBe('Not available')
    expect(formatTemp(30, 'F')).toBe('86°F')
  })
  it('components stay in sync: choosing a location in one place updates the other', async () => {
    function Reader() {
      const { location } = useWeatherLocation()
      return <p data-testid="reader">{location?.name ?? 'none'}</p>
    }
    function Writer() {
      const { setLocation, clear } = useWeatherLocation()
      return (
        <>
          <button type="button" onClick={() => setLocation(here)}>set</button>
          <button type="button" onClick={clear}>clear</button>
        </>
      )
    }
    wrap(<><Reader /><Writer /></>)
    expect(screen.getByTestId('reader')).toHaveTextContent('none')
    await userEvent.click(screen.getByText('set'))
    expect(screen.getByTestId('reader')).toHaveTextContent('Savar')
    await userEvent.click(screen.getByText('clear'))
    expect(screen.getByTestId('reader')).toHaveTextContent('none')
  })
})

// ---------------- location search ----------------
describe('location search', () => {
  const results = [
    { id: '1', name: 'Savar', area: 'Dhaka, Dhaka Division, Bangladesh', type: 'Upazila seat', latitude: 23.85, longitude: 90.26, country: 'Bangladesh' },
    { id: '2', name: 'Savar', area: 'Barguna, Barisal Division, Bangladesh', type: null, latitude: 22.1, longitude: 90.1, country: 'Bangladesh' },
  ]
  const type = (text) => userEvent.type(screen.getByRole('combobox'), text)

  it('waits for the typing to pause (debounce) before searching, and never searches for 1 character', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    searchLocations.mockResolvedValue({ status: 'ok', results })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<LocationSearch selected={null} onSelect={() => {}} onClear={() => {}} />)
    await user.type(screen.getByRole('combobox'), 'S')
    await act(() => vi.advanceTimersByTimeAsync(600))
    expect(searchLocations).not.toHaveBeenCalled()
    await user.type(screen.getByRole('combobox'), 'av')
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(searchLocations).not.toHaveBeenCalled() // still inside the debounce window
    await act(() => vi.advanceTimersByTimeAsync(400))
    expect(searchLocations).toHaveBeenCalledTimes(1)
    expect(searchLocations).toHaveBeenCalledWith('Sav', { country: 'BD' })
  })

  it('shows a loading state, then results; same-named places are told apart by their area', async () => {
    let resolve
    searchLocations.mockReturnValue(new Promise((r) => { resolve = r }))
    render(<LocationSearch selected={null} onSelect={() => {}} onClear={() => {}} />)
    await type('Savar')
    expect(await screen.findByText('Searching…')).toBeInTheDocument()
    await act(async () => resolve({ status: 'ok', results }))
    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(2)
    expect(within(options[0]).getByText('Dhaka, Dhaka Division, Bangladesh')).toBeInTheDocument()
    expect(within(options[1]).getByText('Barguna, Barisal Division, Bangladesh')).toBeInTheDocument()
    expect(within(options[0]).getByText('Upazila seat')).toBeInTheDocument()
  })

  it('choosing a result reports the location with its coordinates and clears the box', async () => {
    searchLocations.mockResolvedValue({ status: 'ok', results })
    const onSelect = vi.fn()
    render(<LocationSearch selected={null} onSelect={onSelect} onClear={() => {}} />)
    await type('Savar')
    await userEvent.click((await screen.findAllByRole('option'))[1])
    expect(onSelect).toHaveBeenCalledWith({ name: 'Savar', area: 'Barguna, Barisal Division, Bangladesh', country: 'Bangladesh', latitude: 22.1, longitude: 90.1, source: 'search' })
    expect(screen.getByRole('combobox')).toHaveValue('')
  })

  it('works from the keyboard (arrows, Enter, Escape)', async () => {
    searchLocations.mockResolvedValue({ status: 'ok', results })
    const onSelect = vi.fn()
    render(<LocationSearch selected={null} onSelect={onSelect} onClear={() => {}} />)
    await type('Savar')
    await screen.findAllByRole('option')
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ area: 'Barguna, Barisal Division, Bangladesh' }))
  })

  it('shows a helpful empty state when nothing matches', async () => {
    searchLocations.mockResolvedValue({ status: 'ok', results: [] })
    render(<LocationSearch selected={null} onSelect={() => {}} onClear={() => {}} />)
    await type('Zzzzz')
    expect(await screen.findByText(/No places found for “Zzzzz” in Bangladesh/)).toBeInTheDocument()
  })

  it.each([
    ['the provider is down (status)', () => searchLocations.mockResolvedValue({ status: 'provider_unavailable', message: 'The data provider is not responding right now.', results: [] }), /not responding/],
    ['the request itself fails', () => searchLocations.mockRejectedValue(new Error('Cannot reach the server.')), /Cannot reach the server/],
  ])('shows an error with a retry when %s', async (_n, arrange, message) => {
    arrange()
    render(<LocationSearch selected={null} onSelect={() => {}} onClear={() => {}} />)
    await type('Dhaka')
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    searchLocations.mockResolvedValue({ status: 'ok', results })
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findAllByRole('option')).toHaveLength(2)
  })

  it('can search anywhere instead of Bangladesh only', async () => {
    searchLocations.mockResolvedValue({ status: 'ok', results: [] })
    render(<LocationSearch selected={null} onSelect={() => {}} onClear={() => {}} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Anywhere' }))
    await type('Paris')
    await waitFor(() => expect(searchLocations).toHaveBeenCalledWith('Paris', { country: 'ANY' }))
  })

  it('shows the selected location and lets the user clear it', async () => {
    const onClear = vi.fn()
    render(<LocationSearch selected={here} onSelect={() => {}} onClear={onClear} />)
    expect(screen.getByText('Savar')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear selected location' }))
    expect(onClear).toHaveBeenCalled()
  })

  describe('current location', () => {
    afterEach(() => { delete navigator.geolocation })
    const geo = (impl) => Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: vi.fn(impl) }, configurable: true })

    it('asks the browser for permission only when the button is clicked', async () => {
      geo((ok) => ok({ coords: { latitude: 23.8123, longitude: 90.4123 } }))
      const onSelect = vi.fn()
      render(<LocationSearch selected={null} onSelect={onSelect} onClear={() => {}} />)
      expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled()
      await userEvent.click(screen.getByRole('button', { name: /Use my current location/ }))
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'My current location', latitude: 23.8123, longitude: 90.4123, source: 'gps' }))
    })
    it('if permission is denied, explains and points to manual search', async () => {
      geo((_ok, fail) => fail({ code: 1 }))
      const onSelect = vi.fn()
      render(<LocationSearch selected={null} onSelect={onSelect} onClear={() => {}} />)
      await userEvent.click(screen.getByRole('button', { name: /Use my current location/ }))
      expect(await screen.findByRole('alert')).toHaveTextContent(/permission was denied.*Search for a place/)
      expect(onSelect).not.toHaveBeenCalled()
    })
    it('a browser without location support gets a clear message', async () => {
      render(<LocationSearch selected={null} onSelect={() => {}} onClear={() => {}} />)
      await userEvent.click(screen.getByRole('button', { name: /Use my current location/ }))
      expect(await screen.findByRole('alert')).toHaveTextContent(/cannot share your location/)
    })
  })
})

// ---------------- weather card ----------------
describe('weather card', () => {
  const q = (over = {}) => ({ data: forecast(), error: null, loading: false, reload: vi.fn(), ...over })

  it('shows every required value from the forecast', () => {
    render(<LocationWeatherCard location={here} query={q()} />)
    expect(screen.getByText('Savar, Dhaka, Dhaka Division, Bangladesh')).toBeInTheDocument()
    expect(screen.getByText('Weather')).toBeInTheDocument()
  })
  it('current conditions, feels like, min/max, rain, wind, humidity, sunrise and sunset', () => {
    render(<ForecastView forecast={forecast()} unit="C" />)
    expect(screen.getByLabelText('Current temperature 31°C')).toBeInTheDocument()
    expect(screen.getAllByText('Partly cloudy').length).toBeGreaterThan(0)
    const dl = screen.getByText('Feels like').closest('dl')
    expect(dl).toHaveTextContent('36°C')
    expect(dl).toHaveTextContent('26°C / 33°C')
    expect(dl).toHaveTextContent('20%')
    expect(dl).toHaveTextContent('14 km/h')
    expect(dl).toHaveTextContent('74%')
    expect(dl).toHaveTextContent('5:22 AM')
    expect(dl).toHaveTextContent('6:21 PM')
  })
  it('shows 24 hourly slots and 7 daily rows', () => {
    render(<ForecastView forecast={forecast()} unit="C" />)
    expect(within(screen.getByRole('region', { name: 'Next 24 hours' })).getAllByRole('listitem')).toHaveLength(24)
    expect(within(screen.getByRole('region', { name: 'Daily forecast' })).getAllByRole('listitem')).toHaveLength(7)
  })
  it('the compact (dashboard) version is shorter: fewer hours and no daily list', () => {
    render(<ForecastView forecast={forecast()} unit="C" compact />)
    expect(within(screen.getByRole('region', { name: 'Next hours' })).getAllByRole('listitem')).toHaveLength(12)
    expect(screen.queryByRole('region', { name: 'Daily forecast' })).not.toBeInTheDocument()
  })
  it('switches between Celsius and Fahrenheit without another request, and remembers it', async () => {
    render(<LocationWeatherCard location={here} query={q()} />)
    expect(screen.getByLabelText(/Current temperature 31°C/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: '°F' }))
    expect(screen.getByLabelText('Current temperature 88°F')).toBeInTheDocument()
    expect(loadUnit()).toBe('F')
    expect(getForecast).not.toHaveBeenCalled()
  })
  it('missing values say "Not available" instead of showing zeros', () => {
    const f = forecast()
    f.current = { ...f.current, feelsLikeC: null, humidityPercent: null, windSpeedKmh: null, rainChancePercent: null }
    f.today = { ...f.today, sunrise: null, sunset: null }
    render(<ForecastView forecast={f} unit="C" />)
    expect(screen.getAllByText('Not available').length).toBeGreaterThanOrEqual(5)
  })
  it('a stale forecast is labelled as not current', () => {
    render(<ForecastView forecast={forecast({ stale: true, fetchedAt: new Date(Date.now() - 3_600_000).toISOString() })} unit="C" />)
    expect(screen.getByRole('alert')).toHaveTextContent(/Not current.*loaded/)
  })
  it('shows weather suggestions from the forecast', () => {
    render(<ForecastView forecast={forecast({ advice: [{ id: 'RAIN', severity: 'info', message: 'Rain expected (70% chance): consider carrying an umbrella.' }] })} unit="C" />)
    expect(screen.getByRole('list', { name: 'Weather suggestions' })).toHaveTextContent('umbrella')
  })
  it('loading skeleton, then error with retry, and a refresh action', async () => {
    const { rerender } = render(<LocationWeatherCard location={here} query={q({ data: null, loading: true })} />)
    expect(screen.getByRole('status', { name: 'Loading weather' })).toBeInTheDocument()
    const reload = vi.fn()
    rerender(<LocationWeatherCard location={here} query={q({ data: null, error: new Error('Cannot reach the server'), reload })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reload).toHaveBeenCalledTimes(1)
    rerender(<LocationWeatherCard location={here} query={q({ data: { status: 'provider_unavailable', message: 'The data provider is not responding right now.' }, reload })} />)
    expect(screen.getByText(/not responding/)).toBeInTheDocument()
    rerender(<LocationWeatherCard location={here} query={q({ reload })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Refresh weather' }))
    expect(reload).toHaveBeenCalledTimes(2)
  })
  it('with no location it is an empty state that leads to the picker', () => {
    wrap(<LocationWeatherCard location={null} query={q({ data: null })} />)
    expect(screen.getByText('Choose a location')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Choose location' })).toHaveAttribute('href', '/explore')
  })
})

// ---------------- destinations ----------------
describe('explore destinations', () => {
  const cafe = place()
  const park = place({ id: 'way/2', name: 'Central Park', category: 'park', categoryLabel: 'Parks', address: null, locality: null, distanceMeters: 1540 })
  const museum = place({ id: 'node/3', name: 'City Museum', category: 'museum', categoryLabel: 'Museums', address: null, locality: 'Old Town', distanceMeters: 2100 })
  const rainy = forecast({ hourly: [hour('2030-05-10T14:00', { rainChancePercent: 80, icon: 'rain', condition: 'Rain' }), ...forecast().hourly.slice(1)] })
  const ok = (places) => ({ status: 'ok', category: 'all', radiusMeters: 2500, places, attribution: '© OpenStreetMap contributors (ODbL)' })
  const show = (props = {}) => wrap(<ExploreDestinations location={here} forecast={forecast()} departure={null} {...props} />)

  it('lists destinations with name, category, distance and address (or "Address not available")', async () => {
    getNearbyPlaces.mockResolvedValue(ok([cafe, park]))
    show()
    const list = await screen.findByRole('list', { name: 'Destinations' })
    expect(within(list).getByText('Sea View Cafe')).toBeInTheDocument()
    expect(within(list).getByText('420 m away')).toBeInTheDocument()
    expect(within(list).getByText('12 Road 5, Gulshan')).toBeInTheDocument()
    expect(within(list).getByText('Address not available')).toBeInTheDocument()
    expect(getNearbyPlaces).toHaveBeenCalledWith({ latitude: 23.85, longitude: 90.26, radius: 2500, category: 'all' })
  })

  it('category filter: choosing Parks asks for parks and shows only parks', async () => {
    getNearbyPlaces.mockImplementation(async ({ category }) => ok(category === 'park' ? [park] : [cafe, park]))
    show()
    await screen.findByText('Sea View Cafe')
    await userEvent.click(screen.getByRole('button', { name: 'Parks' }))
    await waitFor(() => expect(getNearbyPlaces).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'park' })))
    expect(await screen.findByText('Central Park')).toBeInTheDocument()
    expect(screen.queryByText('Sea View Cafe')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Parks' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('a different distance asks the provider for that radius', async () => {
    getNearbyPlaces.mockResolvedValue(ok([cafe]))
    show()
    await screen.findByText('Sea View Cafe')
    await userEvent.selectOptions(screen.getByLabelText('Within'), '5000')
    await waitFor(() => expect(getNearbyPlaces).toHaveBeenLastCalledWith(expect.objectContaining({ radius: 5000 })))
  })

  it('rain likely -> says to consider indoor, marks indoor places as suiting and outdoor ones as worth checking, with the reason', async () => {
    getNearbyPlaces.mockResolvedValue(ok([cafe, park]))
    show({ forecast: rainy })
    expect(await screen.findByText('Rain is likely around that time (80% chance). Consider an indoor destination.')).toBeInTheDocument()
    const cards = screen.getAllByRole('button', { pressed: false }).filter((b) => /^(Sea View Cafe|Central Park)/.test(b.textContent))
    expect(cards[0]).toHaveTextContent('May suit the forecast')
    expect(cards[1]).toHaveTextContent('Check the forecast')
  })

  it('pleasant weather suggests outdoor places', async () => {
    getNearbyPlaces.mockResolvedValue(ok([park]))
    show()
    expect(await screen.findByText(/The forecast looks pleasant around that time \(30°C, 10% chance of rain\)/)).toBeInTheDocument()
    expect(screen.getByText('May suit the forecast')).toBeInTheDocument()
  })

  it('severe weather shows an advisory (alert), never a promise of safety', async () => {
    getNearbyPlaces.mockResolvedValue(ok([park]))
    show({ forecast: forecast({ hourly: [hour('2030-05-10T14:00', { severeCondition: true, condition: 'Thunderstorm', icon: 'thunder' })] }) })
    expect(await screen.findByRole('alert')).toHaveTextContent(/Severe weather is possible.*thunderstorm.*Check local conditions/)
  })

  it('without a forecast there are NO weather-based claims, but destinations still show', async () => {
    getNearbyPlaces.mockResolvedValue(ok([cafe, park]))
    show({ forecast: { status: 'provider_unavailable' } })
    expect(await screen.findByText('Sea View Cafe')).toBeInTheDocument()
    expect(screen.queryByText('May suit the forecast')).not.toBeInTheDocument()
    expect(screen.queryByText(/Rain is likely|pleasant|Severe/)).not.toBeInTheDocument()
    expect(screen.getByText(/Weather-based suggestions are not shown because the forecast is not available/)).toBeInTheDocument()
  })

  it('can base the suggestion on the weather around the next planned departure', async () => {
    getNearbyPlaces.mockResolvedValue(ok([cafe]))
    const f = forecast({ hourly: [hour('2030-05-10T14:00'), hour('2030-05-10T15:00', { rainChancePercent: 90, icon: 'rain', condition: 'Rain' })] })
    show({ forecast: f, departure: { at: '2030-05-10T09:20:00Z', title: 'Interview' } }) // 15:20 in Dhaka
    await screen.findByText('Sea View Cafe')
    await userEvent.selectOptions(screen.getByLabelText('Weather for'), 'departure')
    expect(await screen.findByText('Rain is likely around that time (90% chance). Consider an indoor destination.')).toBeInTheDocument()
  })

  it('a departure beyond the forecast window makes no weather claim', async () => {
    getNearbyPlaces.mockResolvedValue(ok([cafe]))
    show({ forecast: forecast(), departure: { at: '2031-01-01T09:00:00Z', title: 'Far away' } })
    await screen.findByText('Sea View Cafe')
    await userEvent.selectOptions(screen.getByLabelText('Weather for'), 'departure')
    expect(screen.getByText(/forecast is not available for that time/)).toBeInTheDocument()
  })

  it('details show only provider data; unknown fields say Not available (no invented ratings, hours or prices)', async () => {
    getNearbyPlaces.mockResolvedValue(ok([park]))
    show()
    await userEvent.click(await screen.findByRole('button', { name: /^Central Park/ }))
    const details = screen.getByRole('region', { name: 'Details for Central Park' })
    expect(within(details).getByText('Address:').nextSibling).toHaveTextContent('Not available')
    expect(details).toHaveTextContent('Opening hours, ratings, prices: Not available')
    expect(details).toHaveTextContent('Weather nearby (now): 30°C, Partly cloudy, 10% chance of rain')
    expect(details).toHaveTextContent('not measured at this exact spot')
    expect(details).not.toHaveTextContent(/stars|★|\$|৳/)
    expect(within(details).getByRole('link', { name: /OpenStreetMap/ })).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('selecting a marker on the map selects the destination', async () => {
    getNearbyPlaces.mockResolvedValue(ok([cafe, park]))
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'marker Central Park' }))
    expect(screen.getByRole('region', { name: 'Details for Central Park' })).toBeInTheDocument()
    expect(screen.getByTestId('map')).toHaveAttribute('data-selected', 'way/2')
  })

  it('saves a destination to the existing saved places, and reports a duplicate name', async () => {
    getNearbyPlaces.mockResolvedValue(ok([cafe]))
    createPlace.mockResolvedValueOnce({ id: 'p1' })
    show()
    await userEvent.click(await screen.findByRole('button', { name: /^Sea View Cafe/ }))
    await userEvent.click(screen.getByRole('button', { name: /Save to my places/ }))
    expect(createPlace).toHaveBeenCalledWith({ label: 'Sea View Cafe', kind: 'other', address: 'Sea View Cafe, 12 Road 5, Gulshan' })
    expect(await screen.findByText('Saved to your places.')).toBeInTheDocument()
  })
  it('a refused save (duplicate name) is explained', async () => {
    getNearbyPlaces.mockResolvedValue(ok([cafe]))
    createPlace.mockRejectedValueOnce(new Error('You already have a place with this name'))
    show()
    await userEvent.click(await screen.findByRole('button', { name: /^Sea View Cafe/ }))
    await userEvent.click(screen.getByRole('button', { name: /Save to my places/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You already have a place with this name')
  })

  it('"Plan a departure here" opens the new-event form with the destination pre-filled', async () => {
    getNearbyPlaces.mockResolvedValue(ok([cafe]))
    show()
    await userEvent.click(await screen.findByRole('button', { name: /^Sea View Cafe/ }))
    const link = screen.getByRole('link', { name: /Plan a departure here/ })
    expect(link).toHaveAttribute('href', `/events/new?destination=${encodeURIComponent('Sea View Cafe, 12 Road 5, Gulshan')}`)
  })

  it('has a loading state, an empty state and an error with retry', async () => {
    let resolve
    getNearbyPlaces.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    show()
    expect(screen.getByRole('status', { name: 'Loading destinations' })).toBeInTheDocument()
    await act(async () => resolve(ok([])))
    expect(await screen.findByText('No places found here')).toBeInTheDocument()
  })
  it.each([
    ['provider status', () => getNearbyPlaces.mockResolvedValue({ status: 'timeout', message: 'The data provider took too long to answer.', places: [] }), /took too long/],
    ['network error', () => getNearbyPlaces.mockRejectedValue(new Error('Cannot reach the server.')), /Cannot reach the server/],
  ])('shows an error for a %s and retries', async (_n, arrange, message) => {
    arrange()
    show()
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByTestId('map')).toBeInTheDocument() // the map of the chosen location stays, even without places
    expect(screen.queryByText('No places found here')).not.toBeInTheDocument() // a failure is not reported as "no places"
    getNearbyPlaces.mockResolvedValue(ok([cafe]))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Sea View Cafe')).toBeInTheDocument()
  })
  it('shows the OpenStreetMap attribution', async () => {
    getNearbyPlaces.mockResolvedValue(ok([museum]))
    show()
    expect(await screen.findByText(/© OpenStreetMap contributors \(ODbL\)/)).toBeInTheDocument()
  })
})

// ---------------- the page ----------------
describe('Weather & Explore page', () => {
  beforeEach(() => {
    getForecast.mockResolvedValue(forecast())
    getNearbyPlaces.mockResolvedValue({ status: 'ok', category: 'all', radiusMeters: 2500, places: [place()], attribution: 'x' })
    searchLocations.mockResolvedValue({ status: 'ok', results: [{ id: '1', name: 'Savar', area: 'Dhaka, Dhaka Division, Bangladesh', type: 'Upazila seat', latitude: 23.85, longitude: 90.26, country: 'Bangladesh' }] })
  })

  it('starts with a helpful empty state and makes no weather or places requests', () => {
    wrap(<ExplorePage />)
    expect(screen.getByText('Pick a location to begin')).toBeInTheDocument()
    expect(getForecast).not.toHaveBeenCalled()
    expect(getNearbyPlaces).not.toHaveBeenCalled()
  })

  it('choosing a location loads its weather and destinations, and remembers it for next time', async () => {
    const { unmount } = wrap(<ExplorePage />)
    await userEvent.type(screen.getByRole('combobox'), 'Savar')
    await userEvent.click(await screen.findByRole('option'))
    expect(await screen.findByLabelText(/Current temperature/)).toBeInTheDocument()
    expect(await screen.findByText('Sea View Cafe')).toBeInTheDocument()
    expect(getForecast).toHaveBeenCalledWith(expect.objectContaining({ latitude: 23.85, longitude: 90.26 }))
    expect(loadLocation('user-a')).toMatchObject({ name: 'Savar' })

    unmount() // "reload": the saved choice is used again without searching
    getForecast.mockClear()
    wrap(<ExplorePage />)
    expect(await screen.findByLabelText(/Current temperature/)).toBeInTheDocument()
    expect(getForecast).toHaveBeenCalledTimes(1)
  })

  it('opens on the category chosen on the dashboard (?category=), and ignores unknown values', async () => {
    saveLocation('user-a', here)
    const { unmount } = render(<MemoryRouter initialEntries={['/explore?category=park']}><AuthContext.Provider value={{ user: { id: 'user-a' } }}><ExplorePage /></AuthContext.Provider></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'Parks' })).toHaveAttribute('aria-pressed', 'true')
    expect(getNearbyPlaces).toHaveBeenCalledWith(expect.objectContaining({ category: 'park' }))
    unmount()
    getNearbyPlaces.mockClear()
    render(<MemoryRouter initialEntries={['/explore?category=casino']}><AuthContext.Provider value={{ user: { id: 'user-a' } }}><ExplorePage /></AuthContext.Provider></MemoryRouter>)
    expect(await screen.findByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(getNearbyPlaces).toHaveBeenCalledWith(expect.objectContaining({ category: 'all' }))
  })

  it('clearing the selection returns to the empty state', async () => {
    saveLocation('user-a', here)
    wrap(<ExplorePage />)
    await screen.findByLabelText(/Current temperature/)
    await userEvent.click(screen.getByRole('button', { name: 'Clear selected location' }))
    expect(screen.getByText('Pick a location to begin')).toBeInTheDocument()
    expect(loadLocation('user-a')).toBeNull()
  })

  it('offers the next planned departure as the time for weather suggestions', async () => {
    saveLocation('user-a', here)
    getUpcomingPlans.mockResolvedValue({ plans: [{ event: { title: 'Interview' }, plan: { departureTime: '2030-05-10T09:20:00Z' } }] })
    wrap(<ExplorePage />)
    expect(await screen.findByRole('option', { name: /My next departure \(Interview\)/ })).toBeInTheDocument()
  })

  it('a failed forecast does not break destinations', async () => {
    saveLocation('user-a', here)
    getForecast.mockResolvedValue({ status: 'provider_unavailable', message: 'The data provider is not responding right now.' })
    wrap(<ExplorePage />)
    expect(await screen.findByText(/not responding/)).toBeInTheDocument()
    expect(await screen.findByText('Sea View Cafe')).toBeInTheDocument()
  })
})
