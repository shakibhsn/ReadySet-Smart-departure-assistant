import { afterEach, describe, expect, it, vi } from 'vitest'
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

afterEach(() => vi.unstubAllGlobals())

function renderApp(path, { mutate, withEvent = false } = {}) {
  const api = createFakeApi({ users })
  let event = null
  if (withEvent) {
    event = api.toApiEvent({ title: 'Office day', category: 'office', startAt: '2030-05-10T10:00', timezone: 'Asia/Dhaka', destination: 'Dhaka', travelDurationMinutes: 20, preparationMinutes: 15, arrivalBufferMinutes: 5 })
    api.events('token-a').push(event)
  }
  mutate?.(api, event)
  api.install()
  setToken('token-a')
  render(
    <MemoryRouter initialEntries={[path.replace(':id', event?.id)]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  )
  return api
}
const callsTo = (api, method, path) => api.calls.filter((c) => c.method === method && c.path === path)
const prepCalls = (api) => api.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/prep-log'))

const okSuggestion = (minutes, samples = 5, confidence = 'medium') => ({ status: 'ok', minutes, samples, confidence, explanation: `Based on your last ${samples} logged preparations.` })

describe('tap-to-log panel on Event Details', () => {
  it('walks start -> ready -> left, sending only the action (never a timestamp)', async () => {
    const user = userEvent.setup()
    const api = renderApp('/events/:id', { withEvent: true })
    await user.click(await screen.findByRole('button', { name: /Start preparing/ }))
    expect(await screen.findByRole('button', { name: /I'm ready/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /I'm ready/ }))
    await user.click(await screen.findByRole('button', { name: /I left/ }))
    expect(await screen.findByText(/Logged\./)).toBeInTheDocument()
    expect(prepCalls(api).map((c) => c.body)).toEqual([{ action: 'start' }, { action: 'ready' }, { action: 'left' }])
  })

  it('a started session can be cancelled', async () => {
    const user = userEvent.setup()
    const api = renderApp('/events/:id', { withEvent: true })
    await user.click(await screen.findByRole('button', { name: /Start preparing/ }))
    await user.click(await screen.findByRole('button', { name: /Cancel session/ }))
    expect(prepCalls(api).map((c) => c.body.action)).toEqual(['start', 'cancel'])
    expect(await screen.findByText(/will not count towards your profile/)).toBeInTheDocument()
  })

  it('shows the server error for an invalid action and stays usable', async () => {
    const user = userEvent.setup()
    renderApp('/events/:id', { withEvent: true, mutate: (a) => a.override((m, path) => (m === 'POST' && path.endsWith('/prep-log') ? a.respond(409, { success: false, message: 'Tap "Start preparing" first.', errors: [] }) : undefined)) })
    await user.click(await screen.findByRole('button', { name: /Start preparing/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Start preparing')
  })

  it('outside the logging window it only explains when logging opens; when the profile is off it is hidden', async () => {
    const { unmount } = render(<div />)
    unmount()
    renderApp('/events/:id', { withEvent: true, mutate: (a) => a.setPrepState({ window: { opensAt: 'x', closesAt: 'y', open: false } }) })
    expect(await screen.findByText(/Logging opens 1 hour before/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Start preparing/ })).not.toBeInTheDocument()
  })
  it('is hidden when the preparation profile is turned off', async () => {
    renderApp('/events/:id', { withEvent: true, mutate: (a) => a.setPrepState({ enabled: false }) })
    expect(await screen.findByRole('heading', { name: 'Office day' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Preparation log')).not.toBeInTheDocument()
  })
})

describe('Preparation Profile page', () => {
  it('new users see a clear explanation instead of numbers', async () => {
    renderApp('/profile')
    expect(await screen.findByRole('heading', { name: 'Preparation Profile' })).toBeInTheDocument()
    expect(screen.getByText(/Nothing is inferred from your checklist/)).toBeInTheDocument()
    expect((await screen.findAllByText(/Not enough history yet/)).length).toBeGreaterThan(0)
    expect(screen.getByText(/No activity logged this week/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use this as my value' })).not.toBeInTheDocument()
  })

  it('shows suggestions with confidence and sample size, and "Use this" only fills the form (nothing is saved until you press Save)', async () => {
    const user = userEvent.setup()
    const api = renderApp('/profile', { mutate: (a) => a.setPrepProfile({ preparation: { overall: okSuggestion(40), byCategory: { office: okSuggestion(45, 10, 'high') } }, buffer: { status: 'ok', minutes: 20, extraMinutes: 10, currentBuffer: 10, samples: 6, confidence: 'medium', explanation: 'Formula: extra = ...' } }) })
    expect(await screen.findByText('Preparation time: Office')).toBeInTheDocument()
    expect(screen.getByText('high confidence · 10 logged')).toBeInTheDocument()
    expect(screen.getAllByText('How this is calculated').length).toBeGreaterThan(0)
    await user.click(screen.getAllByRole('button', { name: 'Use this as my value' })[1]) // the office suggestion
    expect(screen.getByLabelText('Preparation')).toHaveValue(45)
    expect(callsTo(api, 'PUT', '/prep-profile/overrides')).toHaveLength(0) // explicit save required
    await user.click(screen.getByRole('button', { name: 'Save my value' }))
    await waitFor(() => expect(callsTo(api, 'PUT', '/prep-profile/overrides')).toHaveLength(1))
    expect(callsTo(api, 'PUT', '/prep-profile/overrides')[0].body).toEqual({ category: 'office', prepMinutes: 45 })
    expect(await screen.findByText(/preparation 45 min/)).toBeInTheDocument()
  })

  it('overrides can be cleared, and an empty override form is refused', async () => {
    const user = userEvent.setup()
    const api = renderApp('/profile', { mutate: (a) => a.setPrepProfile({ overrides: { gym: { prepMinutes: 25 } } }) })
    await user.click(await screen.findByRole('button', { name: 'Save my value' }))
    expect(screen.getByText('Enter a preparation time and/or a buffer.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear my value for Gym' }))
    await waitFor(() => expect(callsTo(api, 'DELETE', '/prep-profile/overrides/gym')).toHaveLength(1))
  })

  it('can be turned off and on', async () => {
    const user = userEvent.setup()
    const api = renderApp('/profile')
    await user.click(await screen.findByRole('switch', { name: 'Use my activity to personalize suggestions' }))
    expect(await screen.findByText('The profile is turned off')).toBeInTheDocument()
    expect(callsTo(api, 'PATCH', '/prep-profile/settings')[0].body).toEqual({ enabled: false })
    expect(screen.queryByText(/Preparation time \(all events\)/)).not.toBeInTheDocument()
  })

  it('logs can be deleted individually and erased after confirmation', async () => {
    const user = userEvent.setup()
    const logs = [{ id: 'l1', category: 'office', occurrenceStart: '2030-05-10T04:00:00.000Z', cancelledAt: null, actualPrepMinutes: 35, latenessMinutes: 4 }, { id: 'l2', category: 'gym', occurrenceStart: '2030-05-09T04:00:00.000Z', cancelledAt: '2030-05-09T03:00:00.000Z', actualPrepMinutes: null, latenessMinutes: null }]
    const api = renderApp('/profile', { mutate: (a) => a.setPrepLogs(logs) })
    expect(await screen.findByText(/prep 35 min · left 4 min late/)).toBeInTheDocument()
    expect(screen.getByText(/cancelled/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete log l1' }))
    await waitFor(() => expect(callsTo(api, 'DELETE', '/prep-profile/logs/l1')).toHaveLength(1))
    await user.click(await screen.findByRole('button', { name: 'Erase all my activity' }))
    expect(callsTo(api, 'DELETE', '/prep-profile/data')).toHaveLength(0)
    await user.click(within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Erase' }))
    await waitFor(() => expect(callsTo(api, 'DELETE', '/prep-profile/data')).toHaveLength(1))
    expect(await screen.findByText('Nothing logged yet.')).toBeInTheDocument()
  })

  it('shows an error with a retry when the profile cannot be loaded', async () => {
    const user = userEvent.setup()
    let down = true
    renderApp('/profile', { mutate: (a) => a.override((m, path) => (down && path === '/prep-profile' ? a.respond(500, { success: false, message: 'Profile is down', errors: [] }) : undefined)) })
    expect(await screen.findByText(/Profile is down/)).toBeInTheDocument()
    down = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Preparation Profile' })).toBeInTheDocument()
  })
})

describe('Create event: personalised hints (never applied automatically)', () => {
  it('offers "Use N min" for the chosen category and fills the field only when clicked', async () => {
    const user = userEvent.setup()
    renderApp('/events/new', { mutate: (a) => a.setPrepProfile({ preparation: { overall: okSuggestion(40), byCategory: { office: okSuggestion(45, 10, 'high') } } }) })
    expect(screen.queryByLabelText('Your usual times')).not.toBeInTheDocument()
    await user.selectOptions(await screen.findByLabelText(/Category/), 'office')
    expect(await screen.findByLabelText('Your usual times')).toHaveTextContent('Your usual preparation: 45 min (from 10 logged preparations, high confidence)')
    expect(screen.getByLabelText(/Preparation time/)).toHaveValue(30) // unchanged until the user clicks
    await user.click(screen.getByRole('button', { name: 'Use 45 min' }))
    expect(screen.getByLabelText(/Preparation time/)).toHaveValue(45)
  })

  it('no hint for new users or for a category without enough data; the user\'s own saved value wins', async () => {
    const user = userEvent.setup()
    renderApp('/events/new', { mutate: (a) => a.setPrepProfile({ overrides: { gym: { prepMinutes: 25 } } }) })
    await user.selectOptions(await screen.findByLabelText(/Category/), 'office')
    expect(screen.queryByLabelText('Your usual times')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/Category/), 'gym')
    expect(await screen.findByLabelText('Your usual times')).toHaveTextContent('25 min (your saved value)')
  })
})

describe('weather advice and stale forecasts', () => {
  const ok = { status: 'ok', stale: false, eventStartAt: '2030-05-10T04:00:00.000Z', location: { name: 'Dhaka', region: null, country: 'Bangladesh' }, forecast: { forecastTime: '2030-05-10T04:00:00.000Z', localTime: '2030-05-10T10:00', temperatureC: 34, condition: 'Rain', icon: 'rain', rainChancePercent: 70, windSpeedKmh: 12 }, fetchedAt: new Date().toISOString(), advice: [{ id: 'RAIN', severity: 'info', message: 'Rain expected (70% chance): consider carrying an umbrella.' }, { id: 'SEVERE', severity: 'warning', message: 'Severe weather possible: thunderstorm.' }] }

  it('lists suggestions, with warnings, forecast time and location', () => {
    render(<WeatherView weather={ok} />)
    const list = screen.getByRole('list', { name: 'Weather suggestions' })
    expect(within(list).getByText(/consider carrying an umbrella/)).toBeInTheDocument()
    expect(within(list).getByText(/Severe weather possible/)).toBeInTheDocument()
    expect(screen.getByText(/Forecast for .*10:00 AM.*Dhaka, Bangladesh.*updated/)).toBeInTheDocument()
    expect(screen.queryByText(/Not current/)).not.toBeInTheDocument()
  })

  it('a stale forecast is labelled "Not current" with when it was loaded, never as updated information', () => {
    render(<WeatherView weather={{ ...ok, stale: true, fetchedAt: new Date(Date.now() - 90 * 60_000).toISOString() }} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/Not current.*loaded about 2 hours ago|Not current.*loaded 2 hours ago|Not current.*loaded.*ago/)
    expect(screen.getByText(/Forecast for .*10:00 AM.*Dhaka, Bangladesh.*loaded/)).toBeInTheDocument()
    expect(screen.queryByText(/updated/)).not.toBeInTheDocument()
  })

  it('no advice list when there is none, and unavailable forecasts show only the message', () => {
    render(<WeatherView weather={{ ...ok, advice: [] }} />)
    expect(screen.queryByRole('list', { name: 'Weather suggestions' })).not.toBeInTheDocument()
    render(<WeatherView weather={{ status: 'provider_unavailable', message: 'Weather is temporarily unavailable.' }} />)
    expect(screen.getByText(/temporarily unavailable/)).toBeInTheDocument()
  })
})
