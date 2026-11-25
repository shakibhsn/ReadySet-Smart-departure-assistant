import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '@/routes'
import { AuthProvider } from '@/components/common/AuthProvider'
import { getPageTitle, NAV_ITEMS } from '@/routes/navigation'
import { saveLocation } from '@/lib/weatherLocation'
import { setToken } from '@/lib/tokenStorage'
import { createFakeApi } from './fakeApi'

const pref = { defaultPreparationMinutes: 30, defaultArrivalBufferMinutes: 10, preferredTravelMode: 'manual', timezone: 'Asia/Dhaka' }
const alice = { id: 'u-a', name: 'Alice Anders', email: 'a@example.com', emailVerified: true, preference: pref }
const users = { 'a@example.com': { user: alice, token: 'token-a' } }
const savar = { name: 'Savar', area: 'Dhaka, Dhaka Division, Bangladesh', latitude: 23.85, longitude: 90.26, country: 'Bangladesh', source: 'search' }

afterEach(() => vi.unstubAllGlobals())

function renderApp(path, { setup } = {}) {
  const api = createFakeApi({ users })
  setup?.(api)
  api.install()
  setToken('token-a')
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  )
  return api
}
const callsTo = (api, path) => api.calls.filter((c) => c.method === 'GET' && c.path.split('?')[0] === path)

describe('Weather & Explore inside the app', () => {
  it('is in the navigation and has its own page title', () => {
    expect(NAV_ITEMS.some((n) => n.to === '/explore' && n.label === 'Weather & Explore')).toBe(true)
    expect(getPageTitle('/explore')).toBe('Weather & Explore')
  })

  it('the dashboard shows an invitation to choose a location, without calling any weather provider', async () => {
    const api = renderApp('/')
    expect(await screen.findByText('Choose a location')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Weather & Explore/ }).every((l) => l.getAttribute('href') === '/explore')).toBe(true)
    expect(callsTo(api, '/weather/forecast')).toHaveLength(0)
  })

  it('once a location is chosen, the dashboard shows its real forecast (compact) for that user', async () => {
    saveLocation('u-a', savar)
    const api = renderApp('/')
    expect(await screen.findByLabelText('Current temperature 31°C')).toBeInTheDocument()
    expect(screen.getByText('Savar, Dhaka, Dhaka Division, Bangladesh')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Daily forecast' })).not.toBeInTheDocument() // compact: no long daily list
    expect(callsTo(api, '/weather/forecast')).toHaveLength(1)
    expect(api.calls.find((c) => c.path === '/weather/forecast').params.get('latitude')).toBe('23.85')
  })

  it('the dashboard has the explore shortcuts and the saved-places section (existing feature)', async () => {
    renderApp('/')
    expect(await screen.findByRole('list', { name: 'Explore by category' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Museums' })).toHaveAttribute('href', '/explore?category=museum')
    expect(await screen.findByText(/No saved places yet/)).toBeInTheDocument()
  })

  it("another user's saved location is not shown to this user", async () => {
    saveLocation('someone-else', savar)
    const api = renderApp('/')
    expect(await screen.findByText('Choose a location')).toBeInTheDocument()
    expect(callsTo(api, '/weather/forecast')).toHaveLength(0)
  })

  it('the Explore page searches through the API, then shows weather and destinations', async () => {
    const api = renderApp('/explore', {
      setup: (a) => a.setExplore({
        locations: { status: 'ok', country: 'BD', results: [{ id: '1', name: 'Savar', area: 'Dhaka, Dhaka Division, Bangladesh', type: 'Upazila seat', latitude: 23.85, longitude: 90.26, country: 'Bangladesh' }] },
        places: { status: 'ok', category: 'all', radiusMeters: 2500, places: [{ id: 'node/1', name: 'Sea View Cafe', category: 'cafe', categoryLabel: 'Cafes', latitude: 23.851, longitude: 90.261, distanceMeters: 300, address: null, locality: 'Savar', osmUrl: 'https://www.openstreetmap.org/node/1' }], attribution: 'x' },
      }),
    })
    expect(await screen.findByText('Explore Bangladesh')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('combobox'), 'Savar')
    await userEvent.click(await screen.findByRole('option'))
    expect(await screen.findByLabelText('Current temperature 31°C')).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Destinations' })
    expect(within(list).getByText('Sea View Cafe')).toBeInTheDocument()
    expect(api.calls.find((c) => c.path === '/locations/search').params.get('country')).toBe('BD')
  })

  it('"Plan a departure here" pre-fills the destination on the new-event form (the user still reviews and saves)', async () => {
    renderApp(`/events/new?destination=${encodeURIComponent('Sea View Cafe, 12 Road 5')}`)
    expect(await screen.findByLabelText(/Destination/)).toHaveValue('Sea View Cafe, 12 Road 5')
  })

  it('the new-event form is unchanged without the parameter', async () => {
    renderApp('/events/new')
    expect(await screen.findByLabelText(/Destination/)).toHaveValue('')
  })
})
