import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '@/routes'
import { AuthProvider } from '@/components/common/AuthProvider'
import { NextDepartureCard } from '@/components/dashboard/NextDepartureCard'
import { setToken } from '@/lib/tokenStorage'
import { createFakeApi } from './fakeApi'
import { planStartingIn, time12 } from './planFixture'

const MIN = 60_000
const TZ = 'Asia/Dhaka'
const pref = { defaultPreparationMinutes: 30, defaultArrivalBufferMinutes: 10, preferredTravelMode: 'manual', timezone: TZ }
const alice = { id: 'u-a', name: 'Alice Anders', email: 'a@example.com', emailVerified: true, preference: pref }
const users = { 'a@example.com': { user: alice, token: 'token-a' } }

// ---------- NextDepartureCard (pure component, fake timers, no network) ----------

describe('NextDepartureCard', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const T = Date.parse('2026-11-20T02:00:00.000Z') // 08:00 in Asia/Dhaka
  const renderCard = (plan, onRefresh) =>
    render(
      <MemoryRouter>
        <NextDepartureCard plan={plan} onRefresh={onRefresh} />
      </MemoryRouter>,
    )
  const timer = () => screen.getByRole('timer')

  it('shows the event, the three milestones in the event timezone, the status, a countdown and the CTA', () => {
    vi.useFakeTimers()
    vi.setSystemTime(T)
    const plan = planStartingIn(T, 180) // starts 11:00; prep 09:45 (1h45 from now), leave 10:15, arrive 10:50
    renderCard(plan)

    const card = screen.getByRole('region', { name: 'Next departure' })
    expect(within(card).getByRole('heading', { name: 'Algorithms Midterm' })).toBeInTheDocument()
    expect(card).toHaveTextContent('Hall B')
    expect(card).toHaveTextContent(`Start preparing${plan.local.preparationStart.time12}`)
    expect(card).toHaveTextContent(`Leave at${plan.local.departureTime.time12}`)
    expect(card).toHaveTextContent(`Target arrival${plan.local.targetArrival.time12}`)
    expect(card).toHaveTextContent(plan.local.eventStart.time12)
    expect(within(card).getByText('Upcoming')).toBeInTheDocument()
    expect(card).toHaveTextContent(plan.explanation)

    expect(timer()).toHaveAccessibleName('Countdown: Preparation starts')
    expect(timer()).toHaveTextContent('01hrs45min00sec')
    expect(within(card).getByRole('link', { name: 'View Departure Plan' })).toHaveAttribute('href', '/planner?event=evt-1')
  })

  it('counts down locally from timestamps, with ZERO network requests', () => {
    vi.useFakeTimers()
    vi.setSystemTime(T)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    renderCard(planStartingIn(T, 180))

    expect(timer()).toHaveTextContent('01hrs45min00sec')
    act(() => vi.advanceTimersByTime(5000))
    expect(timer()).toHaveTextContent('01hrs44min55sec')
    act(() => vi.advanceTimersByTime(60_000))
    expect(timer()).toHaveTextContent('01hrs43min55sec')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('uses days instead of seconds when the milestone is far away', () => {
    vi.useFakeTimers()
    vi.setSystemTime(T)
    renderCard(planStartingIn(T, 3 * 24 * 60)) // 3 days away
    expect(timer()).toHaveTextContent('02days22hrs45min') // 3 days minus the 75 minutes before the preparation start
  })

  it('advances UPCOMING -> PREPARING when the preparation start passes, refetching once', () => {
    vi.useFakeTimers()
    vi.setSystemTime(T)
    const onRefresh = vi.fn()
    renderCard(planStartingIn(T, 75 + 0.05), onRefresh) // preparation starts in 3 seconds
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(onRefresh).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(4000))
    expect(screen.getByText('Time to get ready')).toBeInTheDocument()
    expect(timer()).toHaveAccessibleName('Countdown: Time to leave')
    expect(onRefresh).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(30_000))
    expect(onRefresh).toHaveBeenCalledTimes(1) // not once per second
  })

  it('warns when the departure time has passed (late departure)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(T)
    renderCard(planStartingIn(T, 40)) // departure was 5 minutes ago
    expect(screen.getByText('Time to leave')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('You are 5 min past your departure time.')
  })

  it('warns when the target arrival has passed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(T)
    renderCard(planStartingIn(T, 5))
    expect(screen.getByText('Target arrival passed')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Your target arrival time has passed.')
    expect(timer()).toHaveAccessibleName('Countdown: Event starts')
  })

  it('shows the event-started state with no countdown at all', () => {
    vi.useFakeTimers()
    vi.setSystemTime(T)
    renderCard(planStartingIn(T, -10))
    expect(screen.getByText('Event started')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('This event has already started.')
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.getByText('This event has started.')).toBeInTheDocument()
  })

  it('shows an empty state with a Create Event action when there is no plan', () => {
    renderCard(null)
    expect(screen.getByText('No upcoming departures')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create event' })).toHaveAttribute('href', '/events/new')
  })

  it('links a recurring occurrence to its own plan and leaves no timers behind on unmount', () => {
    vi.useFakeTimers()
    vi.setSystemTime(T)
    const plan = planStartingIn(T, 180, { isRecurring: true })
    const { unmount } = renderCard(plan)
    expect(screen.getByRole('link', { name: 'View Departure Plan' })).toHaveAttribute('href', `/planner?event=evt-1&occurrence=${encodeURIComponent(plan.event.startAt)}`)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

// ---------- pages, through the real router and a stateful fake API ----------

function setup({ path = '/', events = () => [], mutate } = {}) {
  const api = createFakeApi({ users })
  for (const e of events(api)) api.events('token-a').push(e)
  mutate?.(api)
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

const seedEvent = (api, startsInMinutes, overrides = {}) =>
  api.toApiEvent({
    title: 'Algorithms Midterm',
    category: 'university',
    startAt: new Date(Math.floor((Date.now() + startsInMinutes * MIN) / MIN) * MIN).toISOString(),
    timezone: TZ,
    destination: 'Hall B',
    travelDurationMinutes: 35,
    preparationMinutes: 30,
    arrivalBufferMinutes: 10,
    recurrence: null,
    ...overrides,
  })

const calls = (api, method, path) => api.calls.filter((c) => c.method === method && c.path === path)

describe('Dashboard: Next Departure from the backend engine', () => {
  it('shows the next event with the times calculated by the API', async () => {
    const api = setup({ events: (a) => [seedEvent(a, 180)] })
    const card = await screen.findByRole('region', { name: 'Next departure' })
    expect(card).toHaveTextContent('Algorithms Midterm')
    const [event] = api.events('token-a')
    const start = new Date(event.startAt)
    expect(card).toHaveTextContent(time12(new Date(start.getTime() - 45 * MIN), TZ)) // leave = start - 10 buffer - 35 travel
    expect(card).toHaveTextContent(time12(new Date(start.getTime() - 75 * MIN), TZ)) // prepare = leave - 30
    expect(within(card).getByRole('link', { name: 'View Departure Plan' })).toHaveAttribute('href', `/planner?event=${event.id}`)
    expect(calls(api, 'GET', '/departure/upcoming')).toHaveLength(1)
  })

  it('picks the plan with the earliest DEPARTURE as the next one', async () => {
    setup({ events: (a) => [seedEvent(a, 240, { title: 'Early start, short trip', travelDurationMinutes: 10 }), seedEvent(a, 300, { title: 'Later start, long trip', travelDurationMinutes: 240 })] })
    const card = await screen.findByRole('region', { name: 'Next departure' })
    expect(card).toHaveTextContent('Later start, long trip') // you must leave for it first
  })

  it('shows the empty state with a Create Event action when there are no events', async () => {
    setup()
    expect(await screen.findByText('No upcoming departures')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /create event/i }).length).toBeGreaterThan(0)
  })

  it('shows an error with retry when the departure engine request fails, then recovers', async () => {
    let fail = true
    const api = setup({
      events: (a) => [seedEvent(a, 180)],
      mutate: (a) => a.override((method, path) => (fail && path === '/departure/upcoming' ? a.respond(500, { success: false, message: 'Something went wrong. Please try again later.', errors: [] }) : undefined)),
    })
    const u = userEvent.setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    fail = false
    await u.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('region', { name: 'Next departure' })).toBeInTheDocument()
    expect(calls(api, 'GET', '/departure/upcoming').length).toBeGreaterThanOrEqual(2)
  })

  it('keeps the countdown moving WITHOUT calling the backend every second', async () => {
    const api = setup({ events: (a) => [seedEvent(a, 300)] })
    const card = await screen.findByRole('region', { name: 'Next departure' })
    const before = within(card).getByRole('timer').textContent
    await new Promise((r) => setTimeout(r, 2300))
    expect(within(card).getByRole('timer').textContent).not.toBe(before) // it ticked
    expect(calls(api, 'GET', '/departure/upcoming')).toHaveLength(1) // but no extra requests
  }, 15000)

  it('shows the late-departure warning for an event whose departure time already passed', async () => {
    setup({ events: (a) => [seedEvent(a, 40)] }) // departure was ~5 minutes ago
    const card = await screen.findByRole('region', { name: 'Next departure' })
    expect(within(card).getByRole('alert')).toHaveTextContent(/past your departure time/)
    expect(within(card).getByText('Time to leave')).toBeInTheDocument()
  })

  it('refreshes after event data changes (a newly created event shows up)', async () => {
    const api = setup({ path: '/events/new' })
    const u = userEvent.setup()
    await u.type(await screen.findByLabelText(/Event title/), 'Brand new event')
    await u.selectOptions(screen.getByLabelText(/Category/), 'office')
    await u.type(screen.getByLabelText(/Start time/), '23:30')
    await u.type(screen.getByLabelText(/Travel duration/), '20')
    await u.click(screen.getByRole('button', { name: 'Save event' }))
    await screen.findByText('Event created.')
    await u.click(screen.getAllByRole('link', { name: 'Dashboard' })[0])
    await waitFor(() => expect(calls(api, 'GET', '/departure/upcoming').length).toBeGreaterThan(0))
    expect(api.events('token-a')).toHaveLength(1)
  })
})

describe('Create Event form: live preview comes from the backend engine', () => {
  it('shows nothing until the input is valid, then sends ONE debounced preview that includes the form timezone', async () => {
    const api = setup({ path: '/events/new' })
    const u = userEvent.setup()
    await u.type(await screen.findByLabelText(/Start time/), '10:00')
    await new Promise((r) => setTimeout(r, 500))
    expect(calls(api, 'POST', '/departure/preview')).toHaveLength(0) // no travel time yet: nothing to calculate
    expect(screen.getByText(/enter a travel duration/i)).toBeInTheDocument()

    await u.type(screen.getByLabelText(/Travel duration/), '35') // two keystrokes
    await waitFor(() => expect(calls(api, 'POST', '/departure/preview')).toHaveLength(1))
    await new Promise((r) => setTimeout(r, 600))
    expect(calls(api, 'POST', '/departure/preview')).toHaveLength(1) // not one per keystroke
    expect(calls(api, 'POST', '/departure/preview')[0].body).toMatchObject({ startAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T10:00$/), timezone: expect.any(String), travelDurationMinutes: 35 })

    const preview = screen.getByText('Live preview').closest('div')
    expect(await within(preview.parentElement).findByText('Leave home')).toBeInTheDocument()
    expect(api.events('token-a')).toHaveLength(0) // previewing saves nothing
  })
})

describe('Departure Planner', () => {
  it('shows the backend plan for the selected event: status, formula cards and a four-step timeline', async () => {
    const api = setup({ path: '/planner', events: (a) => [seedEvent(a, 180)] })
    const [event] = api.events('token-a')
    const timeline = await screen.findByRole('list', { name: 'Departure timeline' })
    const start = new Date(event.startAt)

    const steps = within(timeline).getAllByRole('listitem')
    expect(steps).toHaveLength(4)
    expect(steps[0]).toHaveTextContent('Preparation starts')
    expect(steps[0]).toHaveTextContent(time12(new Date(start.getTime() - 75 * MIN), TZ))
    expect(steps[1]).toHaveTextContent('Leave home')
    expect(steps[1]).toHaveTextContent(time12(new Date(start.getTime() - 45 * MIN), TZ))
    expect(steps[2]).toHaveTextContent('Target arrival')
    expect(steps[3]).toHaveTextContent('Event starts')
    expect(steps[3]).toHaveTextContent(time12(start, TZ))

    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(screen.getByText('Server message for UPCOMING')).toBeInTheDocument()
    expect(screen.getByText('Departure time')).toBeInTheDocument()
    expect(calls(api, 'GET', `/events/${event.id}/departure-plan`)).toHaveLength(1)
    expect(calls(api, 'POST', '/departure/preview')).toHaveLength(0) // nothing to preview yet
  })

  it('preselects the event from ?event=', async () => {
    const api = setup({ path: '/planner', events: (a) => [seedEvent(a, 120, { title: 'First' }), seedEvent(a, 600, { title: 'Second' })] })
    await screen.findByRole('list', { name: 'Departure timeline' })
    const second = api.events('token-a').find((e) => e.title === 'Second')
    // re-render directly on the second event
    document.body.innerHTML = ''
    const api2 = createFakeApi({ users })
    api2.events('token-a').push(api.events('token-a')[0], second)
    api2.install()
    render(
      <MemoryRouter initialEntries={[`/planner?event=${second.id}`]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    )
    await waitFor(() => expect(calls(api2, 'GET', `/events/${second.id}/departure-plan`)).toHaveLength(1))
    expect(screen.getByLabelText('Event')).toHaveValue(second.id)
  })

  it('what-if calculator: one debounced preview request, clearly labelled, and NOTHING is saved', async () => {
    const api = setup({ path: '/planner', events: (a) => [seedEvent(a, 300)] })
    const u = userEvent.setup()
    const travel = await screen.findByLabelText('Travel duration')
    const [event] = api.events('token-a')
    const stored = JSON.stringify(api.events('token-a'))

    await u.clear(travel)
    await u.type(travel, '50') // typed quickly: must collapse into ONE request

    await waitFor(() => expect(calls(api, 'POST', '/departure/preview')).toHaveLength(1))
    expect(calls(api, 'POST', '/departure/preview')[0].body).toEqual({
      startAt: event.startAt,
      timezone: TZ,
      travelDurationMinutes: 50,
      preparationMinutes: 30,
      arrivalBufferMinutes: 10,
    })
    expect(await screen.findByText('Preview only, nothing is saved')).toBeInTheDocument()

    await new Promise((r) => setTimeout(r, 700))
    expect(calls(api, 'POST', '/departure/preview')).toHaveLength(1)
    // no event write of any kind
    expect(api.calls.filter((c) => ['PATCH', 'DELETE'].includes(c.method) || (c.method === 'POST' && c.path === '/events'))).toHaveLength(0)
    expect(JSON.stringify(api.events('token-a'))).toBe(stored)

    // the preview reflects the NEW travel time: leave = start - 10 - 50
    const start = new Date(event.startAt)
    expect(screen.getByText('Leave home').closest('li')).toHaveTextContent(time12(new Date(start.getTime() - 60 * MIN), TZ))

    await u.click(screen.getByRole('button', { name: /reset to saved values/i }))
    await waitFor(() => expect(screen.queryByText('Preview only, nothing is saved')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Travel duration')).toHaveValue(35)
  }, 15000)

  it('rejects invalid durations locally: shows the problem and sends no request', async () => {
    const api = setup({ path: '/planner', events: (a) => [seedEvent(a, 300)] })
    const u = userEvent.setup()
    const prep = await screen.findByLabelText('Preparation time')
    await u.clear(prep)
    await u.type(prep, '-5')
    expect(await screen.findByText('Enter 0–1440 minutes.')).toBeInTheDocument()
    expect(screen.getByText('Check your inputs')).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 600))
    expect(calls(api, 'POST', '/departure/preview')).toHaveLength(0)
  })

  it('custom plan: asks for date, time and timezone and previews through the backend', async () => {
    const api = setup({ path: '/planner', events: (a) => [seedEvent(a, 300)] })
    const u = userEvent.setup()
    await screen.findByRole('list', { name: 'Departure timeline' })
    await u.selectOptions(screen.getByLabelText('Event'), 'custom')
    await u.clear(screen.getByLabelText('Event start time'))
    await u.type(screen.getByLabelText('Event start time'), '15:00')
    await waitFor(() => expect(calls(api, 'POST', '/departure/preview').length).toBeGreaterThan(0))
    const body = calls(api, 'POST', '/departure/preview').at(-1).body
    expect(body).toMatchObject({ startAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T15:00$/), timezone: TZ, travelDurationMinutes: 35, preparationMinutes: 30, arrivalBufferMinutes: 10 })
    expect(await screen.findByText('Preview only, nothing is saved')).toBeInTheDocument()
    expect(screen.getByLabelText('Timezone')).toHaveValue(TZ)
  }, 15000)

  it('with no saved events it still works as a custom calculator', async () => {
    const api = setup({ path: '/planner' })
    expect(await screen.findByLabelText('Event')).toHaveValue('custom')
    expect(screen.getByLabelText('Event date')).toBeInTheDocument()
    await waitFor(() => expect(calls(api, 'POST', '/departure/preview').length).toBeGreaterThan(0))
  })

  it('shows a loading state while the plan is calculated', async () => {
    let release
    const gate = new Promise((r) => (release = r))
    setup({
      path: '/planner',
      events: (a) => [seedEvent(a, 300)],
      mutate: (a) => a.override((method, path) => (path.endsWith('/departure-plan') ? gate.then(() => undefined).then(() => a.respond(200, { success: true, data: planStartingIn(Date.now(), 300) })) : undefined)),
    })
    expect(await screen.findByRole('status', { name: 'Calculating departure plan' })).toBeInTheDocument()
    release()
    expect(await screen.findByRole('list', { name: 'Departure timeline' })).toBeInTheDocument()
  })

  it('shows an error with retry when the plan cannot be calculated', async () => {
    let fail = true
    setup({
      path: '/planner',
      events: (a) => [seedEvent(a, 300)],
      mutate: (a) => a.override((method, path) => (fail && path.endsWith('/departure-plan') ? a.respond(500, { success: false, message: 'Something went wrong. Please try again later.', errors: [] }) : undefined)),
    })
    const u = userEvent.setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    fail = false
    await u.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('list', { name: 'Departure timeline' })).toBeInTheDocument()
  })

  it('shows the late warning and the started state in the plan panel', async () => {
    setup({ path: '/planner', events: (a) => [seedEvent(a, 40)] }) // departure passed 5 minutes ago
    expect(await screen.findByText('Server message for READY_TO_LEAVE')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Server message for READY_TO_LEAVE')
    expect(screen.getByText('Time to leave')).toBeInTheDocument()
  })
})

describe('Event details: departure plan', () => {
  it('offers "View Departure Plan" and shows the plan for the event\'s saved values', async () => {
    const api = setup({ events: (a) => [seedEvent(a, 180)] })
    const [event] = api.events('token-a')
    document.body.innerHTML = ''
    const api2 = createFakeApi({ users })
    api2.events('token-a').push(event)
    api2.install()
    render(
      <MemoryRouter initialEntries={[`/events/${event.id}`]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('link', { name: 'View Departure Plan' })).toHaveAttribute('href', `/planner?event=${event.id}`)
    expect(await screen.findByRole('list', { name: 'Departure timeline' })).toBeInTheDocument()
    expect(screen.getByText('Departure plan')).toBeInTheDocument()
    expect(calls(api2, 'GET', `/events/${event.id}/departure-plan`)).toHaveLength(1)
  })
})
