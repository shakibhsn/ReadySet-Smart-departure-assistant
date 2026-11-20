import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '@/routes'
import { AuthProvider } from '@/components/common/AuthProvider'
import { WeatherView } from '@/components/weather/WeatherCard'
import { setToken } from '@/lib/tokenStorage'
import { createFakeApi } from './fakeApi'

const pref = { defaultPreparationMinutes: 30, defaultArrivalBufferMinutes: 10, preferredTravelMode: 'manual', timezone: 'Asia/Dhaka' }
const alice = { id: 'u-a', name: 'Alice Anders', email: 'a@example.com', emailVerified: true, preference: pref }
const users = { 'a@example.com': { user: alice, token: 'token-a' } }

function setup({ path = '/checklist', category = 'university', weather, mutate } = {}) {
  const api = createFakeApi({ users })
  const event = api.toApiEvent({ title: 'Algorithms Class', category, startAt: '2030-05-10T10:00', timezone: 'Asia/Dhaka', destination: 'Dhaka', travelDurationMinutes: 30, preparationMinutes: 30, arrivalBufferMinutes: 10 })
  api.events('token-a').push(event)
  if (weather) api.setWeather(weather)
  mutate?.(api)
  api.install()
  setToken('token-a')
  render(
    <MemoryRouter initialEntries={[path.replace(':id', event.id)]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  )
  return { api, event }
}

const progress = () => screen.getByTestId('checklist-progress')

describe('Smart Checklist page (database-backed)', () => {
  it('shows an empty state with a category template; applying it lists the items and progress', async () => {
    const user = userEvent.setup()
    const { api, event } = setup()
    expect(await screen.findByText('No checklist yet')).toBeInTheDocument()
    expect(progress()).toHaveTextContent('0/0 done')
    await user.click(screen.getByRole('button', { name: /Add University \/ Class items/ }))
    expect(await screen.findByText('Laptop')).toBeInTheDocument()
    expect(screen.getByText('Charger')).toBeInTheDocument()
    expect(progress()).toHaveTextContent('0/2 done')
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Added 2 items')
    expect(api.checklist('token-a', event.id)).toHaveLength(2)
  })

  it('a custom event gets no template button (nothing unnecessary is created)', async () => {
    setup({ category: 'other' })
    expect(await screen.findByText('No checklist yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add .* items/ })).not.toBeInTheDocument()
  })

  it('adds, completes (immediately), edits and deletes an item', async () => {
    const user = userEvent.setup()
    const { api, event } = setup()
    await screen.findByText('No checklist yet')

    await user.type(screen.getByLabelText('Add item'), 'Umbrella')
    await user.click(screen.getByRole('button', { name: /^Add$/ }))
    expect(await screen.findByText('Umbrella')).toBeInTheDocument()
    expect(progress()).toHaveTextContent('0/1 done')
    expect(screen.getByLabelText('Add item')).toHaveValue('')

    await user.click(screen.getByRole('checkbox'))
    expect(progress()).toHaveTextContent('1/1 done') // optimistic: no waiting for the network
    await waitFor(() => expect(api.checklist('token-a', event.id)[0].done).toBe(true))
    await user.click(screen.getByRole('checkbox'))
    expect(progress()).toHaveTextContent('0/1 done')

    await user.click(screen.getByRole('button', { name: 'Edit Umbrella' }))
    const input = screen.getByLabelText('Rename Umbrella')
    await user.clear(input)
    await user.type(input, 'Rain jacket{Enter}')
    expect(await screen.findByText('Rain jacket')).toBeInTheDocument()
    expect(api.checklist('token-a', event.id)[0].text).toBe('Rain jacket')

    await user.click(screen.getByRole('button', { name: 'Delete Rain jacket' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('Rain jacket')).not.toBeInTheDocument())
    expect(api.checklist('token-a', event.id)).toHaveLength(0)
  })

  it('validates an empty name on the client and shows a server error without losing the list', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    await screen.findByText('No checklist yet')
    await user.click(screen.getByRole('button', { name: /^Add$/ }))
    expect(screen.getByText('Enter an item name.')).toBeInTheDocument()

    api.override((method, path) => (method === 'POST' && path.endsWith('/checklist') ? api.respond(500, { success: false, message: 'Server exploded', errors: [] }) : undefined))
    await user.type(screen.getByLabelText('Add item'), 'Keys')
    await user.click(screen.getByRole('button', { name: /^Add$/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Server exploded')
    expect(screen.getByLabelText('Add item')).toHaveValue('Keys') // the user's text is kept for a retry
  })

  it('rolls a completion back and explains when the server refuses it', async () => {
    const user = userEvent.setup()
    const { api } = setup()
    await screen.findByText('No checklist yet')
    await user.type(screen.getByLabelText('Add item'), 'Keys')
    await user.click(screen.getByRole('button', { name: /^Add$/ }))
    await screen.findByText('Keys')
    api.override((method, path) => (path.endsWith('/completion') ? api.respond(500, { success: false, message: 'Could not save', errors: [] }) : undefined))
    await user.click(screen.getByRole('checkbox'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(progress()).toHaveTextContent('0/1 done')
  })

  it('shows an error with a retry when the checklist cannot be loaded', async () => {
    const user = userEvent.setup()
    let down = true
    setup({ mutate: (api) => api.override((method, path) => (down && method === 'GET' && path.endsWith('/checklist') ? api.respond(500, { success: false, message: 'Checklist is down', errors: [] }) : undefined)) })
    expect(await screen.findByText(/Checklist is down/)).toBeInTheDocument()
    down = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No checklist yet')).toBeInTheDocument()
  })

  it('shows a loading state until the list arrives', async () => {
    let release
    const gate = new Promise((resolve) => { release = resolve })
    setup({
      mutate: (api) =>
        api.override((method, path) =>
          method === 'GET' && path.endsWith('/checklist')
            ? gate.then(() => api.respond(200, { success: true, message: 'ok', data: { items: [], progress: { total: 0, done: 0 } } }))
            : undefined,
        ),
    })
    expect(await screen.findByRole('status', { name: 'Loading checklist' })).toBeInTheDocument()
    release()
    expect(await screen.findByText('No checklist yet')).toBeInTheDocument()
  })
})

describe('Weather (optional context)', () => {
  const ok = {
    status: 'ok',
    eventStartAt: '2030-05-10T04:00:00.000Z',
    location: { name: 'Dhaka', region: 'Dhaka Division', country: 'Bangladesh' },
    forecast: { forecastTime: '2030-05-10T04:00:00.000Z', localTime: '2030-05-10T10:00', temperatureC: 29, condition: 'Rain', icon: 'rain', rainChancePercent: 60, windSpeedKmh: 14 },
    fetchedAt: new Date().toISOString(),
  }

  it('Event Details shows temperature, condition, rain chance, wind, forecast time and last updated', async () => {
    setup({ path: '/events/:id', weather: ok })
    const card = (await screen.findByText('Info only')).closest('div[class*="rounded"]')
    expect(card).not.toBeNull()
    expect(await screen.findByText('29°C')).toBeInTheDocument()
    expect(screen.getByText('Rain')).toBeInTheDocument()
    expect(screen.getByText('60% chance of rain')).toBeInTheDocument()
    expect(screen.getByText('14 km/h wind')).toBeInTheDocument()
    expect(screen.getByText(/Forecast for .*10:00 AM.*Dhaka, Bangladesh.*updated/)).toBeInTheDocument()
  })

  it('the Smart Checklist page also shows the weather for the selected event', async () => {
    setup({ weather: ok })
    expect(await screen.findByText('29°C')).toBeInTheDocument()
  })

  it('missing location: a friendly message, the rest of the page still works', async () => {
    setup({ path: '/events/:id' })
    expect(await screen.findByText('Add a destination to see the weather.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Algorithms Class' })).toBeInTheDocument()
    expect(await screen.findByText('No checklist yet')).toBeInTheDocument()
  })

  it.each([
    ['location_not_found', 'We could not find this destination.'],
    ['forecast_unavailable', 'No forecast is available for this time yet.'],
    ['provider_unavailable', 'Weather is temporarily unavailable.'],
    ['timeout', 'The weather service took too long to respond.'],
  ])('%s shows its message', (status, message) => {
    render(<WeatherView weather={{ status, message }} onRetry={() => {}} />)
    expect(screen.getByText(new RegExp(message))).toBeInTheDocument()
  })

  it('a failed or timed-out provider offers a retry; an unknown location does not', () => {
    const { rerender } = render(<WeatherView weather={{ status: 'timeout', message: 'Slow' }} onRetry={() => {}} />)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    rerender(<WeatherView weather={{ status: 'location_not_found', message: 'Nope' }} onRetry={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('optional values (rain, wind) are simply left out when the provider has none', () => {
    const partial = { ...ok, forecast: { ...ok.forecast, rainChancePercent: null, windSpeedKmh: null } }
    render(<WeatherView weather={partial} />)
    expect(screen.getByText('29°C')).toBeInTheDocument()
    expect(screen.queryByText(/chance of rain/)).not.toBeInTheDocument()
    expect(screen.queryByText(/km\/h/)).not.toBeInTheDocument()
  })

  it('a failed weather request shows a calm message and does not break the page', async () => {
    setup({
      path: '/events/:id',
      mutate: (api) => api.override((method, path) => (path.endsWith('/weather') ? api.respond(500, { success: false, message: 'boom', errors: [] }) : undefined)),
    })
    expect(await screen.findByText(/Weather is unavailable right now/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Algorithms Class' })).toBeInTheDocument()
  })
})
