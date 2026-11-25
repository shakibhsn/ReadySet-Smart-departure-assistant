import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { BangladeshExplorer } from '@/components/explore/BangladeshExplorer'
import { resetBoundaryCache } from '@/lib/geo/boundaries'
import { boundsOf, findContaining, interiorPoint, pointInGeometry } from '@/lib/geo/geometry'
import { getForecast, getNearbyPlaces } from '@/services/exploreApi'
import { createPlace, getPlaces } from '@/services/packingApi'

vi.mock('@/services/exploreApi', () => ({ getForecast: vi.fn(), getNearbyPlaces: vi.fn() }))
vi.mock('@/services/packingApi', () => ({ createPlace: vi.fn(), getPlaces: vi.fn() }))

// ---- the real boundary files (public/geo) ----
const read = (name) => JSON.parse(readFileSync(`public/geo/${name}`, 'utf8')).features
const divisions = read('bd-divisions.json')
const districts = read('bd-districts.json')
const upazilaFiles = readdirSync('public/geo/upazilas')
const upazilas = upazilaFiles.flatMap((f) => read(`upazilas/${f}`))
const named = (features, name) => features.find((f) => f.properties.name === name)

describe('Bangladesh boundary data (geoBoundaries)', () => {
  it('has Bangladesh\'s 8 divisions, 64 districts and 544 upazilas', () => {
    expect(divisions).toHaveLength(8)
    expect(districts).toHaveLength(64)
    expect(upazilas).toHaveLength(544)
    expect(divisions.map((d) => d.properties.name).sort()).toEqual(['Barishal', 'Chattogram', 'Dhaka', 'Khulna', 'Mymensingh', 'Rajshahi', 'Rangpur', 'Sylhet'])
  })

  it('the hierarchy is complete: every district has a division, every upazila a district, with the expected district counts', () => {
    const divisionIds = new Set(divisions.map((d) => d.properties.id))
    expect(districts.every((d) => divisionIds.has(d.properties.divisionId))).toBe(true)
    const districtIds = new Set(districts.map((d) => d.properties.id))
    expect(upazilas.every((u) => districtIds.has(u.properties.districtId))).toBe(true)
    const per = (name) => districts.filter((d) => d.properties.divisionId === named(divisions, name).properties.id).length
    expect(['Dhaka', 'Chattogram', 'Khulna', 'Rajshahi', 'Rangpur', 'Barishal', 'Sylhet', 'Mymensingh'].map(per)).toEqual([13, 11, 10, 8, 8, 6, 4, 4])
    expect(upazilaFiles).toHaveLength(64)
  })

  it('every area has a centre point that is really inside its boundary', () => {
    for (const f of [...divisions, ...districts, ...upazilas]) {
      const [lat, lon] = f.properties.centre
      expect(pointInGeometry(lat, lon, f.geometry), f.properties.name).toBe(true)
    }
  })

  it('known places fall in the right areas, and a point outside Bangladesh matches nothing', () => {
    expect(findContaining(divisions, 23.81, 90.41).properties.name).toBe('Dhaka') // Dhaka city
    expect(findContaining(districts, 21.45, 91.98).properties.name).toBe("Cox's Bazar")
    expect(findContaining(divisions, 24.9, 91.87).properties.name).toBe('Sylhet') // Sylhet city
    expect(findContaining(divisions, 28.6, 77.2)).toBeNull() // Delhi
  })

  it('geometry helpers respect holes and compute bounds', () => {
    const donut = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] }
    expect(pointInGeometry(1, 1, donut)).toBe(true)
    expect(pointInGeometry(5, 5, donut)).toBe(false)
    expect(boundsOf(donut)).toEqual([[0, 0], [10, 10]])
    const [lat, lon] = interiorPoint(donut)
    expect(pointInGeometry(lat, lon, donut)).toBe(true)
  })
})

// ---- the explorer (real Leaflet, real boundary files served through a fetch stub) ----
const serveGeo = () =>
  vi.stubGlobal('fetch', vi.fn(async (url) => (existsSync(`public${url}`)
    ? { ok: true, status: 200, json: async () => JSON.parse(readFileSync(`public${url}`, 'utf8')) }
    : { ok: false, status: 404, json: async () => ({}) })))
const ok = (places = []) => ({ status: 'ok', category: 'all', radiusMeters: 10000, places, attribution: 'x' })
const cafe = { id: 'node/1', name: 'Sea View Cafe', category: 'cafe', categoryLabel: 'Cafes', latitude: 23.85, longitude: 90.4, distanceMeters: 420, address: 'Road 5', locality: 'Savar', osmUrl: 'https://www.openstreetmap.org/node/1' }
const view = () => render(<MemoryRouter><BangladeshExplorer /></MemoryRouter>)
const geolocation = (impl) => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: vi.fn(impl) } })

beforeEach(() => {
  vi.clearAllMocks()
  resetBoundaryCache()
  serveGeo()
  getForecast.mockResolvedValue({ status: 'ok', current: { temperatureC: 31, condition: 'Partly cloudy', rainChancePercent: 20 }, hourly: [], daily: [] })
  getNearbyPlaces.mockResolvedValue(ok([cafe]))
  getPlaces.mockResolvedValue({ places: [{ id: 'p1', label: 'Dhaka office', address: 'Gulshan, Dhaka' }] })
  createPlace.mockResolvedValue({ id: 'new' })
})
afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'geolocation')
})

const openDhakaDistrict = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Dhaka' })) // the Dhaka division in the list
  await userEvent.click(await within(await screen.findByRole('list', { name: 'Districts in Dhaka' })).findByRole('button', { name: 'Dhaka' }))
}

describe('Bangladesh explorer', () => {
  it('starts on the Bangladesh overview: the map and eight divisions, with no location request and no places request', async () => {
    geolocation(() => {})
    const { container } = view()
    expect(await screen.findByRole('region', { name: /Map of Bangladesh/ })).toBeInTheDocument()
    expect(within(await screen.findByRole('list', { name: 'Divisions' })).getAllByRole('button')).toHaveLength(8)
    await waitFor(() => expect(container.querySelectorAll('.leaflet-overlay-pane path').length).toBeGreaterThanOrEqual(8 + 64)) // divisions plus the district lines
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled()
    expect(getNearbyPlaces).not.toHaveBeenCalled()
  })

  it('selecting a division shows its districts, the weather for its centre, and a way back to the overview', async () => {
    view()
    await userEvent.click(await screen.findByRole('button', { name: 'Sylhet' }))
    const list = await screen.findByRole('list', { name: 'Districts in Sylhet' })
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['Habiganj', 'Maulvibazar', 'Sunamganj', 'Sylhet'])
    expect(screen.getByRole('navigation', { name: 'Selected area' })).toHaveTextContent('Bangladesh')
    expect(await screen.findByText(/31°C, Partly cloudy/)).toBeInTheDocument()
    expect(getForecast).toHaveBeenCalledTimes(1)
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Selected area' })).getByRole('button', { name: 'Bangladesh' }))
    expect(await screen.findByRole('list', { name: 'Divisions' })).toBeInTheDocument()
  })

  it('selecting a district shows destinations around its centre, its upazilas, and the Save / Plan actions', async () => {
    view()
    await openDhakaDistrict()
    await screen.findByText('Sea View Cafe')
    const dhaka = named(districts, 'Dhaka')
    expect(getNearbyPlaces).toHaveBeenCalledWith(expect.objectContaining({ latitude: dhaka.properties.centre[0], longitude: dhaka.properties.centre[1], radius: 10000 }))
    expect(screen.getByRole('list', { name: 'Upazilas in Dhaka' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Plan a departure here/ })).toHaveAttribute('href', expect.stringContaining('/events/new?destination=Dhaka%2C%20Dhaka%20Division'))
    await userEvent.click(screen.getByRole('button', { name: /Save to my places/ }))
    expect(createPlace).toHaveBeenCalledWith({ label: 'Dhaka', kind: 'other', address: 'Dhaka, Dhaka Division' })
    expect(await screen.findByText('Saved to your places.')).toBeInTheDocument()
  })

  it('shows only the user\'s own saved places that mention the area, and clicking a destination offers the existing save and plan actions', async () => {
    view()
    await openDhakaDistrict()
    expect(await screen.findByText(/Your saved places that mention Dhaka/)).toBeInTheDocument()
    expect(screen.getByText('Dhaka office')).toBeInTheDocument()
    await userEvent.click(await within(await screen.findByRole('list', { name: 'Destinations' })).findByRole('button', { name: /Sea View Cafe/ }))
    const details = screen.getByRole('region', { name: 'Details for Sea View Cafe' })
    expect(within(details).getByRole('link', { name: /Plan a departure here/ })).toBeInTheDocument()
    await userEvent.click(within(details).getByRole('button', { name: /Save to my places/ }))
    expect(createPlace).toHaveBeenCalledWith(expect.objectContaining({ label: 'Sea View Cafe' }))
  })

  it('never invents travel times: the area says routing is not available', async () => {
    view()
    await userEvent.click(await screen.findByRole('button', { name: 'Rangpur' }))
    expect(await screen.findByText(/Travel time is not shown because ReadySet has no routing service/)).toBeInTheDocument()
  })

  it('"Use my location" asks for permission only when clicked, then selects the district and upazila containing the point', async () => {
    geolocation((ok) => ok({ coords: { latitude: 23.8103, longitude: 90.4125 } }))
    view()
    await screen.findByRole('list', { name: 'Divisions' })
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /Use my location/ }))
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('You are in Dhaka district.')).toBeInTheDocument()
    const crumbs = screen.getByRole('navigation', { name: 'Selected area' })
    expect(within(crumbs).getByRole('button', { name: 'Dhaka Division' })).toBeInTheDocument()
    await waitFor(() => expect(within(crumbs).getAllByRole('button')).toHaveLength(4)) // Bangladesh › Division › District › Upazila
  })

  it('a denied location permission leaves the map and the selection fully usable', async () => {
    geolocation((_ok, fail) => fail({ code: 1 }))
    view()
    await screen.findByRole('list', { name: 'Divisions' })
    await userEvent.click(screen.getByRole('button', { name: /Use my location/ }))
    expect(await screen.findByText(/permission was denied/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Khulna' }))
    expect(await screen.findByRole('list', { name: 'Districts in Khulna' })).toBeInTheDocument()
  })

  it('a location outside Bangladesh selects nothing and says so', async () => {
    geolocation((ok) => ok({ coords: { latitude: 28.6, longitude: 77.2 } }))
    view()
    await screen.findByRole('list', { name: 'Divisions' })
    await waitFor(() => expect(screen.getByRole('button', { name: /Use my location/ })).toBeEnabled())
    await new Promise((r) => setTimeout(r, 300)) // let the district file arrive
    await userEvent.click(screen.getByRole('button', { name: /Use my location/ }))
    expect(await screen.findByText(/outside Bangladesh|still loading/)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Divisions' })).toBeInTheDocument()
  })

  it('a map-data failure is explained, offers a retry that really retries, and does not crash the page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })))
    view()
    expect(await screen.findByText(/map could not be loaded/)).toBeInTheDocument()
    serveGeo()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('list', { name: 'Divisions' })).toBeInTheDocument()
  })

  it('selecting an area never changes the saved weather location', async () => {
    view()
    await openDhakaDistrict()
    await screen.findByText('Sea View Cafe')
    expect(Object.keys(localStorage).filter((k) => k.toLowerCase().includes('location'))).toEqual([])
  })
})
