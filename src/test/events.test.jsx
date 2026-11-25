import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { addDays, format, getISODay } from 'date-fns'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '@/routes'
import { AuthProvider } from '@/components/common/AuthProvider'
import { getToken, setToken } from '@/lib/tokenStorage'
import { createFakeApi } from './fakeApi'

const pref = { defaultPreparationMinutes: 30, defaultArrivalBufferMinutes: 10, preferredTravelMode: 'manual', timezone: 'Asia/Dhaka' }
const alice = { id: 'u-a', name: 'Alice Anders', email: 'a@example.com', preference: pref }
const bob = { id: 'u-b', name: 'Bob Brown', email: 'b@example.com', preference: pref }
const users = {
  'a@example.com': { user: alice, token: 'token-a' },
  'b@example.com': { user: bob, token: 'token-b' },
}

const today = format(new Date(), 'yyyy-MM-dd')
const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')

const makeEvent = (api, overrides = {}) =>
  api.toApiEvent({
    title: 'Database Systems Class',
    category: 'university',
    startAt: `${tomorrow}T10:00`,
    timezone: 'Asia/Dhaka',
    destination: 'Engineering Building',
    notes: null,
    travelDurationMinutes: 35,
    preparationMinutes: 30,
    arrivalBufferMinutes: 10,
    recurrence: null,
    ...overrides,
  })

function setup({ path = '/', events, signedInAs = 'token-a' } = {}) {
  const api = createFakeApi({ users })
  if (events) for (const [token, list] of Object.entries(events(api))) api.events(token).push(...list)
  api.install()
  if (signedInAs) setToken(signedInAs)
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        
          <AppRoutes />
        
      </AuthProvider>
    </MemoryRouter>,
  )
  return api
}

const greeting = (name) => screen.findByRole('heading', { name: new RegExp(`good (morning|afternoon|evening), ${name}`, 'i') })
const requestsTo = (api, method, path) => api.calls.filter((c) => c.method === method && c.path === path)

describe('Create Event form -> API', () => {
  it('submits local time + timezone to POST /events, then shows the new event on the schedule', async () => {
    const api = setup({ path: '/events/new' })
    const u = userEvent.setup()
    await u.type(await screen.findByLabelText(/Event title/), '  Team standup ')
    await u.selectOptions(screen.getByLabelText(/Category/), 'office')
    await u.type(screen.getByLabelText(/Start time/), '09:30')
    await u.type(screen.getByLabelText(/Travel duration/), '25')
    await u.type(screen.getByLabelText('Destination'), 'HQ')
    await u.click(screen.getByRole('button', { name: 'Save event' }))

    expect(await screen.findByText('Event created.')).toBeInTheDocument()
    const posts = requestsTo(api, 'POST', '/events')
    expect(posts).toHaveLength(1)
    expect(posts[0].token).toBe('token-a')
    expect(posts[0].body).toEqual({
      title: 'Team standup',
      category: 'office',
      startAt: `${today}T09:30`, // local wall time, NOT converted in the browser
      timezone: 'Asia/Dhaka', // from the user's saved preference
      destination: 'HQ',
      notes: null,
      travelDurationMinutes: 25,
      preparationMinutes: 30,
      arrivalBufferMinutes: 10,
      recurrence: null,
    })
    expect(await screen.findByRole('link', { name: 'Team standup' })).toBeInTheDocument()
    expect(api.events('token-a')).toHaveLength(1)
  })

  it('sends a weekly recurrence with chosen weekdays and an end date', async () => {
    const api = setup({ path: '/events/new' })
    const u = userEvent.setup()
    await u.type(await screen.findByLabelText(/Event title/), 'Yoga')
    await u.selectOptions(screen.getByLabelText(/Category/), 'personal')
    await u.type(screen.getByLabelText(/Start time/), '07:00')
    await u.type(screen.getByLabelText(/Travel duration/), '10')

    await u.click(screen.getByLabelText('Repeat this event'))
    await u.selectOptions(screen.getByLabelText('Repeats'), 'WEEKLY')
    const dayLabels = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' }
    const todayIso = getISODay(new Date())
    await u.click(screen.getByRole('button', { name: dayLabels[todayIso] }))
    const endsOn = format(addDays(new Date(), 60), 'yyyy-MM-dd')
    await u.selectOptions(screen.getByLabelText('Ends'), 'date')
    await u.type(screen.getByLabelText(/Ends on/), endsOn)
    await u.click(screen.getByRole('button', { name: 'Save event' }))

    await screen.findByText('Event created.')
    expect(requestsTo(api, 'POST', '/events')[0].body.recurrence).toEqual({ frequency: 'WEEKLY', interval: 1, daysOfWeek: [todayIso], endsOn })
  })

  it('validates in the browser first (no request) and shows server validation errors under the field', async () => {
    const api = setup({ path: '/events/new' })
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Save event' }))
    expect(await screen.findByText('Give your event a title.')).toBeInTheDocument()
    expect(requestsTo(api, 'POST', '/events')).toHaveLength(0)

    await u.type(screen.getByLabelText(/Event title/), 'bad') // the fake server rejects this title
    await u.selectOptions(screen.getByLabelText(/Category/), 'office')
    await u.type(screen.getByLabelText(/Start time/), '09:00')
    await u.type(screen.getByLabelText(/Travel duration/), '10')
    await u.click(screen.getByRole('button', { name: 'Save event' }))
    expect(await screen.findByText('Server says no')).toBeInTheDocument()
    expect(screen.getByLabelText(/Event title/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('prevents duplicate submissions while a request is in flight', async () => {
    const api = createFakeApi({ users })
    let release
    const gate = new Promise((r) => (release = r))
    api.override((method, path) => (method === 'POST' && path === '/events' ? gate.then(() => api.respond(201, { success: true, data: { event: makeEvent(api) } })) : undefined))
    api.install()
    setToken('token-a')
    render(
      <MemoryRouter initialEntries={['/events/new']}>
        <AuthProvider><AppRoutes /></AuthProvider>
      </MemoryRouter>,
    )
    const u = userEvent.setup()
    await u.type(await screen.findByLabelText(/Event title/), 'Once')
    await u.selectOptions(screen.getByLabelText(/Category/), 'office')
    await u.type(screen.getByLabelText(/Start time/), '09:00')
    await u.type(screen.getByLabelText(/Travel duration/), '10')
    const save = screen.getByRole('button', { name: 'Save event' })
    await u.click(save)
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    await u.click(screen.getByRole('button', { name: 'Saving…' }))
    expect(requestsTo(api, 'POST', '/events')).toHaveLength(1)
    release()
    await screen.findByText('Event created.')
  })
})

describe('My Schedule shows database events', () => {
  const seed = (api) => ({
    'token-a': [
      makeEvent(api, { title: 'Lecture', category: 'university', startAt: `${today}T10:00` }),
      makeEvent(api, { title: 'Sprint review', category: 'office', startAt: `${today}T14:00`, destination: null }),
    ],
    'token-b': [makeEvent(api, { title: 'Bob private event', startAt: `${today}T11:00` })],
  })

  it('lists only the signed-in user events with title, category, time and destination, and filters by category', async () => {
    const api = setup({ path: '/schedule', events: seed })
    const u = userEvent.setup()
    await u.click(await screen.findByRole('radio', { name: 'List' }))
    expect(await screen.findByRole('link', { name: 'Lecture' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sprint review' })).toBeInTheDocument()
    expect(screen.queryByText('Bob private event')).not.toBeInTheDocument()
    expect(screen.getByText('Engineering Building')).toBeInTheDocument()
    expect(screen.getAllByText('10:00')[0]).toBeInTheDocument()

    await u.selectOptions(screen.getByLabelText('Category'), 'office')
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Lecture' })).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Sprint review' })).toBeInTheDocument()
    expect(api.calls.some((c) => c.path === '/events' && c.params.get('category') === 'office')).toBe(true)
  })

  it('filters by date range', async () => {
    const api = setup({ path: '/schedule', events: (a) => ({ 'token-a': [makeEvent(a, { title: 'Today thing', startAt: `${today}T10:00` }), makeEvent(a, { title: 'Tomorrow thing', startAt: `${tomorrow}T10:00` })] }) })
    const u = userEvent.setup()
    await u.click(await screen.findByRole('radio', { name: 'List' }))
    await screen.findByRole('link', { name: 'Today thing' })
    await u.type(screen.getByLabelText('From'), tomorrow)
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Today thing' })).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Tomorrow thing' })).toBeInTheDocument()
    expect(api.calls.some((c) => c.path === '/events' && c.params.get('from') === tomorrow)).toBe(true)
  })

  it('paginates the list', async () => {
    const api = setup({
      path: '/schedule',
      events: (a) => ({ 'token-a': Array.from({ length: 12 }, (_, i) => makeEvent(a, { title: `Event ${String(i + 1).padStart(2, '0')}`, startAt: `${tomorrow}T${String(8 + (i % 12)).padStart(2, '0')}:00` })) }),
    })
    const u = userEvent.setup()
    await u.click(await screen.findByRole('radio', { name: 'List' }))
    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(10)
    await u.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    expect(api.calls.some((c) => c.path === '/events' && c.params.get('page') === '2')).toBe(true)
  })

  it('shows an empty state with a create action when there are no events', async () => {
    setup({ path: '/schedule', events: () => ({}) })
    const u = userEvent.setup()
    await u.click(await screen.findByRole('radio', { name: 'List' }))
    expect(await screen.findByText('Your schedule is empty')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create your first event' })).toHaveAttribute('href', '/events/new')
  })

  it('shows an error state with retry when the API fails, then recovers', async () => {
    const api = createFakeApi({ users })
    let fail = true
    api.override((method, path) => (fail && path === '/events/occurrences' ? api.respond(500, { success: false, message: 'Something went wrong. Please try again later.', errors: [] }) : undefined))
    api.install()
    setToken('token-a')
    render(<MemoryRouter initialEntries={['/schedule']}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter>)
    const u = userEvent.setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    fail = false
    await u.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('sends the user back to login when the session has expired (401)', async () => {
    const api = createFakeApi({ users })
    api.override((method, path) => (path.startsWith('/events') ? api.respond(401, { success: false, message: 'Session expired. Please log in again.', errors: [] }) : undefined))
    api.install()
    setToken('token-a')
    render(<MemoryRouter initialEntries={['/schedule']}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })
})

describe('edit and delete', () => {
  it('opens an event, edits it through PATCH and shows the update', async () => {
    const api = setup({ path: '/events/evt-edit/edit', events: (a) => ({ 'token-a': [makeEvent(a, { title: 'Old title', startAt: `${today}T10:00` })] }) })
    api.events('token-a')[0].id = 'evt-edit'
    const u = userEvent.setup()
    const title = await screen.findByLabelText(/Event title/)
    expect(title).toHaveValue('Old title')
    expect(screen.getByLabelText(/Start time/)).toHaveValue('10:00')
    await u.clear(title)
    await u.type(title, 'New title')
    await u.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Event updated.')).toBeInTheDocument()
    const patches = requestsTo(api, 'PATCH', '/events/evt-edit')
    expect(patches).toHaveLength(1)
    expect(patches[0].body).toMatchObject({ title: 'New title', startAt: `${today}T10:00`, timezone: 'Asia/Dhaka' })
    expect(await screen.findByRole('link', { name: 'New title' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Old title' })).not.toBeInTheDocument()
  })

  it('shows event details with edit/delete and a not-found message for unknown ids', async () => {
    setup({ path: '/events/evt-x', events: (a) => ({ 'token-a': [makeEvent(a, { title: 'Detail me', notes: 'Bring laptop' })] }) })
    // the seeded event has a generated id, so evt-x does not exist for this user
    expect(await screen.findByRole('alert')).toHaveTextContent('This event was not found.')
  })

  it('asks for confirmation before deleting, then removes the event from the schedule', async () => {
    const api = setup({ path: '/schedule', events: (a) => ({ 'token-a': [makeEvent(a, { title: 'Delete me', startAt: `${today}T10:00` }), makeEvent(a, { title: 'Keep me', startAt: `${today}T12:00` })] }) })
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Delete Delete me' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Delete this event?')).toBeInTheDocument()
    expect(requestsTo(api, 'DELETE', `/events/${api.events('token-a')[0].id}`)).toHaveLength(0) // nothing deleted yet

    await u.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Event deleted.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Delete me' })).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Keep me' })).toBeInTheDocument()
    expect(api.events('token-a').map((e) => e.title)).toEqual(['Keep me'])
  })

  it('cancelling the confirmation deletes nothing', async () => {
    const api = setup({ path: '/schedule', events: (a) => ({ 'token-a': [makeEvent(a, { title: 'Stay', startAt: `${today}T10:00` })] }) })
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Delete Stay' }))
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(api.calls.filter((c) => c.method === 'DELETE')).toHaveLength(0)
    expect(screen.getByRole('link', { name: 'Stay' })).toBeInTheDocument()
  })
})

describe('Dashboard shows real events', () => {
  it('shows the next event, today\'s events, upcoming events and the total count', async () => {
    setup({
      events: (a) => ({
        'token-a': [
          makeEvent(a, { title: 'Today class', startAt: `${today}T23:50` }),
          makeEvent(a, { title: 'Tomorrow flight', category: 'travel', startAt: `${tomorrow}T07:45`, destination: 'Airport' }),
        ],
      }),
    })
    await greeting('Alice')
    expect(await screen.findByText(/You have 2 events scheduled/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Next departure' })).toHaveTextContent('Today class')
    const todaySection = screen.getByRole('heading', { name: /Today's schedule/ }).closest('div[class*="rounded-"]')
    expect(within(todaySection).getByText('Today class')).toBeInTheDocument()
    expect(within(todaySection).queryByText('Tomorrow flight')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Upcoming events' })).toBeInTheDocument()
    expect(screen.queryByText('Database Systems Class')).not.toBeInTheDocument() // no leftover mock data
    expect(screen.queryByText('Doctor Appointment')).not.toBeInTheDocument()
  })

  it('shows a useful empty state with a Create Event action when there are no events', async () => {
    setup({ events: () => ({}) })
    await greeting('Alice')
    expect(await screen.findByText(/Add your first event to get started/)).toBeInTheDocument()
    expect(screen.getByText('No upcoming departures')).toBeInTheDocument()
    expect(screen.getByText('No events yet')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Create event/i }).length).toBeGreaterThan(0)
  })

  it('shows an error with retry if events cannot be loaded', async () => {
    const api = createFakeApi({ users })
    api.override((method, path) => (path === '/events/upcoming' ? api.respond(500, { success: false, message: 'Something went wrong. Please try again later.', errors: [] }) : undefined))
    api.install()
    setToken('token-a')
    render(<MemoryRouter initialEntries={['/']}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('logout clears event state; a new login refetches', () => {
  it("user B never sees user A's events after A logs out and B logs in (same tab, no reload)", async () => {
    const api = setup({
      events: (a) => ({ 'token-a': [makeEvent(a, { title: 'Alice secret meeting', startAt: `${today}T23:55` })] }),
    })
    const u = userEvent.setup()
    await greeting('Alice')
    expect(await screen.findByRole('region', { name: 'Next departure' })).toHaveTextContent('Alice secret meeting')

    await u.click(screen.getAllByRole('button', { name: /log out/i })[0])
    await screen.findByRole('heading', { name: 'Welcome back' })
    expect(screen.queryByText('Alice secret meeting')).not.toBeInTheDocument()
    const requestsBefore = api.calls.length

    await u.type(screen.getByLabelText('Email'), 'b@example.com')
    await u.type(screen.getByLabelText('Password'), 'Sup3rSecret!')
    await u.click(screen.getByRole('button', { name: 'Log in' }))
    await greeting('Bob')
    expect(await screen.findByText(/Add your first event to get started/)).toBeInTheDocument()
    expect(screen.queryByText('Alice secret meeting')).not.toBeInTheDocument()

    // B's data was refetched with B's own token; A's token was never reused.
    const afterLogin = api.calls.slice(requestsBefore).filter((c) => c.path.startsWith('/events'))
    expect(afterLogin.length).toBeGreaterThan(0)
    expect(afterLogin.every((c) => c.token === 'token-b')).toBe(true)
  })
})
