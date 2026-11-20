import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '@/routes'
import { AuthProvider } from '@/components/common/AuthProvider'
import { EventsProvider } from '@/components/common/EventsProvider'
import { ConflictsCard } from '@/components/events/ConflictsCard'
import { OccurrencePanel } from '@/components/events/OccurrencePanel'
import { SaveTemplateButton } from '@/components/events/SaveTemplateButton'
import { formToPayload, emptyEventForm, validateEventForm } from '@/components/events/eventFormUtils'
import { setToken } from '@/lib/tokenStorage'
import { createFakeApi } from './fakeApi'
import { planStartingIn } from './planFixture'

const pref = { defaultPreparationMinutes: 30, defaultArrivalBufferMinutes: 10, preferredTravelMode: 'manual', timezone: 'Asia/Dhaka' }
const alice = { id: 'u-a', name: 'Alice Anders', email: 'a@example.com', emailVerified: true, preference: pref }
const users = { 'a@example.com': { user: alice, token: 'token-a' } }

afterEach(() => vi.unstubAllGlobals())

function renderApp(path, { mutate } = {}) {
  const api = createFakeApi({ users })
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
/** Components that only need the API + the events cache. */
function renderPart(ui, { mutate } = {}) {
  const api = createFakeApi({ users })
  mutate?.(api)
  api.install()
  setToken('token-a')
  render(
    <MemoryRouter>
      <EventsProvider>{ui}</EventsProvider>
    </MemoryRouter>,
  )
  return api
}
const callsTo = (api, method, path) => api.calls.filter((c) => c.method === method && c.path === path)

describe('event form payload: recurrence end modes and duration', () => {
  const filled = (over) => ({ ...emptyEventForm({ timezone: 'Asia/Dhaka', date: '2030-05-06' }), title: 'T', category: 'office', startTime: '10:00', travelMinutes: '20', ...over })

  it('monthly "after N times" sends count and no end date', () => {
    const payload = formToPayload(filled({ recurring: true, frequency: 'MONTHLY', interval: '2', endMode: 'count', count: '6' }))
    expect(payload.recurrence).toEqual({ frequency: 'MONTHLY', interval: 2, endsOn: null, count: 6 })
  })
  it('"on a date" sends the date and no count; "never" sends neither', () => {
    expect(formToPayload(filled({ recurring: true, endMode: 'date', endsOn: '2030-12-31' })).recurrence).toEqual({ frequency: 'DAILY', interval: 1, endsOn: '2030-12-31' })
    expect(formToPayload(filled({ recurring: true })).recurrence).toEqual({ frequency: 'DAILY', interval: 1, endsOn: null })
  })
  it('duration is only sent when set, or as null to clear one that existed', () => {
    expect(formToPayload(filled())).not.toHaveProperty('durationMinutes')
    expect(formToPayload(filled({ durationMinutes: '90' })).durationMinutes).toBe(90)
    expect(formToPayload(filled({ hadDuration: true })).durationMinutes).toBeNull()
  })
  it('validates the new fields', () => {
    expect(validateEventForm(filled({ recurring: true, endMode: 'count', count: '0' })).count).toBeTruthy()
    expect(validateEventForm(filled({ recurring: true, endMode: 'count', count: '366' })).count).toBeTruthy()
    expect(validateEventForm(filled({ recurring: true, endMode: 'date', endsOn: '' })).endsOn).toBeTruthy()
    expect(validateEventForm(filled({ durationMinutes: '0' })).durationMinutes).toBeTruthy()
    expect(validateEventForm(filled({ recurring: true, frequency: 'MONTHLY', endMode: 'count', count: '12', durationMinutes: '45' }))).toEqual({})
  })
})

describe('Create event page', () => {
  it('offers Monthly and the end options, and posts a count-limited monthly series', async () => {
    const user = userEvent.setup()
    const api = renderApp('/events/new')
    await user.type(await screen.findByLabelText(/Event title/), 'Rent review')
    await user.selectOptions(screen.getByLabelText(/Category/), 'personal')
    await user.type(screen.getByLabelText(/Start time/), '09:00')
    await user.type(screen.getByLabelText(/Travel duration/), '15')
    await user.type(screen.getByLabelText(/Duration \(optional\)/), '45')
    await user.click(screen.getByLabelText('Repeat this event'))
    await user.selectOptions(screen.getByLabelText('Repeats'), 'MONTHLY')
    expect(screen.getByText(/shorter months use their last day/)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Ends'), 'count')
    await user.type(screen.getByLabelText('Number of occurrences'), '6')
    await user.click(screen.getByRole('button', { name: 'Save event' }))
    await waitFor(() => expect(callsTo(api, 'POST', '/events')).toHaveLength(1))
    const body = callsTo(api, 'POST', '/events')[0].body
    expect(body.recurrence).toMatchObject({ frequency: 'MONTHLY', interval: 1, count: 6, endsOn: null })
    expect(body.durationMinutes).toBe(45)
  })

  it('a template fills the form (the date and time stay yours to choose)', async () => {
    const user = userEvent.setup()
    renderApp('/events/new', {
      mutate: (api) => api.seedTemplates('token-a', [{ name: 'Morning class', title: 'Algorithms', category: 'university', destination: 'Hall B', travelDurationMinutes: 25, preparationMinutes: 20, arrivalBufferMinutes: 5, recurrence: { frequency: 'WEEKLY', interval: 1, daysOfWeek: [1, 3] } }]),
    })
    await user.selectOptions(await screen.findByLabelText('Start from a template'), 'Morning class')
    expect(screen.getByLabelText(/Event title/)).toHaveValue('Algorithms')
    expect(screen.getByLabelText(/Travel duration/)).toHaveValue(25)
    expect(screen.getByLabelText('Destination')).toHaveValue('Hall B')
    expect(screen.getByLabelText(/Start time/)).toHaveValue('')
    expect(screen.getByLabelText('Repeat this event')).toBeChecked()
  })

  it('without templates the picker is not shown, and a template list failure never blocks the form', async () => {
    renderApp('/events/new')
    expect(await screen.findByLabelText(/Event title/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Start from a template')).not.toBeInTheDocument()
  })

  it('a selected template can be deleted', async () => {
    const user = userEvent.setup()
    const api = renderApp('/events/new', { mutate: (a) => a.seedTemplates('token-a', [{ name: 'Old', title: 'Old', category: 'other', travelDurationMinutes: 5, preparationMinutes: 5, arrivalBufferMinutes: 5 }]) })
    await user.selectOptions(await screen.findByLabelText('Start from a template'), 'Old')
    await user.click(screen.getByRole('button', { name: 'Delete template Old' }))
    await waitFor(() => expect(screen.queryByLabelText('Start from a template')).not.toBeInTheDocument())
    expect(callsTo(api, 'DELETE', '/event-templates/tpl-seed-0')).toHaveLength(1)
  })
})

describe('OccurrencePanel (skip, edit, restore one occurrence)', () => {
  const plan = (over = {}) => {
    const p = planStartingIn(Date.now(), 24 * 60, { isRecurring: true })
    return { ...p, event: { ...p.event, originalStart: p.event.startAt, isModified: false, ...over } }
  }
  const event = { id: 'evt-1', title: 'Algorithms Midterm', isRecurring: true }

  it('skips only after confirmation, sending the occurrence identity', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    const p = plan()
    const api = renderPart(<OccurrencePanel event={event} plan={p} onChanged={onChanged} />)
    await user.click(screen.getByRole('button', { name: /Skip this occurrence/ }))
    expect(api.calls.filter((c) => c.path.includes('skip'))).toHaveLength(0) // nothing yet
    await user.click(within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Skip it' }))
    await waitFor(() => expect(callsTo(api, 'POST', '/events/evt-1/occurrences/skip')).toHaveLength(1))
    expect(callsTo(api, 'POST', '/events/evt-1/occurrences/skip')[0].body).toEqual({ originalStart: p.event.originalStart })
    expect(await screen.findByText(/Occurrence skipped/)).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalled()
  })

  it('edits one occurrence (new time, travel) with the original identity', async () => {
    const user = userEvent.setup()
    const p = plan()
    const api = renderPart(<OccurrencePanel event={event} plan={p} onChanged={() => {}} />)
    await user.click(screen.getByRole('button', { name: /Edit this occurrence/ }))
    const dialog = screen.getByRole('dialog', { name: 'Edit this occurrence' })
    const time = within(dialog).getByLabelText('Start time')
    await user.clear(time)
    await user.type(time, '13:30')
    const travel = within(dialog).getByLabelText('Travel duration')
    await user.clear(travel)
    await user.type(travel, '55')
    await user.click(within(dialog).getByRole('button', { name: 'Save this occurrence' }))
    await waitFor(() => expect(callsTo(api, 'PATCH', '/events/evt-1/occurrences')).toHaveLength(1))
    const body = callsTo(api, 'PATCH', '/events/evt-1/occurrences')[0].body
    expect(body).toMatchObject({ originalStart: p.event.originalStart, travelDurationMinutes: 55 })
    expect(body.startAt).toMatch(/T13:30$/)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit this occurrence' })).not.toBeInTheDocument())
  })

  it('validates the edit form on the client', async () => {
    const user = userEvent.setup()
    const api = renderPart(<OccurrencePanel event={event} plan={plan()} onChanged={() => {}} />)
    await user.click(screen.getByRole('button', { name: /Edit this occurrence/ }))
    const dialog = screen.getByRole('dialog', { name: 'Edit this occurrence' })
    await user.clear(within(dialog).getByLabelText('Travel duration'))
    await user.click(within(dialog).getByRole('button', { name: 'Save this occurrence' }))
    expect(within(dialog).getByText('Enter 1–1440 minutes.')).toBeInTheDocument()
    expect(callsTo(api, 'PATCH', '/events/evt-1/occurrences')).toHaveLength(0)
  })

  it('a changed occurrence shows a badge and can be restored', async () => {
    const user = userEvent.setup()
    const p = plan({ isModified: true })
    const api = renderPart(<OccurrencePanel event={event} plan={p} onChanged={() => {}} />)
    expect(screen.getByText('Changed')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Restore original/ }))
    await waitFor(() => expect(callsTo(api, 'POST', '/events/evt-1/occurrences/restore')).toHaveLength(1))
    expect(await screen.findByText(/back to the series settings/)).toBeInTheDocument()
  })

  it('shows the server error and keeps the user in place when the request fails', async () => {
    const user = userEvent.setup()
    renderPart(<OccurrencePanel event={event} plan={plan()} onChanged={() => {}} />, {
      mutate: (api) => api.override((method, path) => (path.endsWith('/skip') ? api.respond(400, { success: false, message: 'Not an occurrence of this event', errors: [] }) : undefined)),
    })
    await user.click(screen.getByRole('button', { name: /Skip this occurrence/ }))
    await user.click(within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Skip it' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not an occurrence of this event')
  })
})

describe('SaveTemplateButton', () => {
  it('saves the event as a template by id and confirms', async () => {
    const user = userEvent.setup()
    const api = renderPart(<SaveTemplateButton event={{ id: 'evt-9', title: 'Weekly sync' }} />)
    await user.click(screen.getByRole('button', { name: 'Save as template' }))
    expect(screen.getByLabelText('Template name')).toHaveValue('Weekly sync')
    await user.click(screen.getByRole('button', { name: 'Save template' }))
    expect(await screen.findByText(/Template saved/)).toBeInTheDocument()
    expect(callsTo(api, 'POST', '/event-templates')[0].body).toEqual({ name: 'Weekly sync', fromEventId: 'evt-9' })
  })
  it('requires a name', async () => {
    const user = userEvent.setup()
    const api = renderPart(<SaveTemplateButton event={{ id: 'evt-9', title: 'x' }} />)
    await user.click(screen.getByRole('button', { name: 'Save as template' }))
    await user.clear(screen.getByLabelText('Template name'))
    await user.click(screen.getByRole('button', { name: 'Save template' }))
    expect(screen.getByText('Give the template a name.')).toBeInTheDocument()
    expect(callsTo(api, 'POST', '/event-templates')).toHaveLength(0)
  })
})

describe('ConflictsCard', () => {
  const conflict = {
    id: 'OVERLAP:a:b', type: 'OVERLAP', severity: 'high', message: '"Lecture" (10:00 AM–11:00 AM) overlaps "Meeting", which starts at 10:30 AM.',
    events: [{ eventId: 'e1', title: 'Lecture', startAt: '2030-05-10T04:00:00.000Z', endAt: '2030-05-10T05:00:00.000Z', assumedDuration: true, destination: null }, { eventId: 'e2', title: 'Meeting', startAt: '2030-05-10T04:30:00.000Z', endAt: '2030-05-10T05:30:00.000Z', assumedDuration: false, destination: null }],
    suggestion: { eventId: 'e2', title: 'Meeting', suggestedStartAt: '2030-05-10T06:10:00.000Z', local: { date: '2030-05-10', time12: '12:10 PM', timezone: 'Asia/Dhaka' }, shiftMinutes: 100, note: 'Suggestion only.' },
  }

  it('shows severity, both events, the explanation, the suggestion and the assumptions', async () => {
    renderPart(<ConflictsCard />, { mutate: (api) => api.setConflicts({ eventsChecked: 2, conflicts: [conflict], summary: { high: 1, medium: 0 } }) })
    expect(await screen.findByText(/overlaps "Meeting"/)).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Lecture' })).toHaveAttribute('href', '/events/e1')
    expect(screen.getByText(/duration assumed/)).toBeInTheDocument()
    expect(screen.getByText(/12:10 PM \(100 min later\). Nothing has been changed/)).toBeInTheDocument()
    expect(screen.getByText(/assumed to last 60 minutes/)).toBeInTheDocument()
  })
  it('says so when there are no conflicts; the compact dashboard version renders nothing', async () => {
    const { unmount } = render(<div />)
    unmount()
    renderPart(<ConflictsCard />)
    expect(await screen.findByText('No conflicts found.')).toBeInTheDocument()
  })
  it('compact mode hides itself when there is nothing to report', async () => {
    const api = renderPart(<ConflictsCard compact />)
    await waitFor(() => expect(api.calls.some((c) => c.path === '/schedule/conflicts')).toBe(true))
    expect(screen.queryByText('Schedule conflicts')).not.toBeInTheDocument()
  })
  it('shows an error with a retry when the analysis fails', async () => {
    const user = userEvent.setup()
    let down = true
    renderPart(<ConflictsCard />, { mutate: (api) => api.override((method, path) => (down && path === '/schedule/conflicts' ? api.respond(500, { success: false, message: 'Analysis failed', errors: [] }) : undefined)) })
    expect(await screen.findByText(/Analysis failed/)).toBeInTheDocument()
    down = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No conflicts found.')).toBeInTheDocument()
  })
  it('appears on the Schedule page and (only when there are conflicts) on the Dashboard', async () => {
    renderApp('/schedule', { mutate: (api) => api.setConflicts({ eventsChecked: 2, conflicts: [conflict], summary: { high: 1, medium: 0 } }) })
    expect(await screen.findByLabelText('Schedule conflicts')).toBeInTheDocument()
    expect(await screen.findByText(/overlaps "Meeting"/)).toBeInTheDocument()
  })
})
