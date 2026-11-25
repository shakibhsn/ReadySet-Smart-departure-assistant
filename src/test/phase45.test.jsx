import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { EventsProvider } from '@/components/common/EventsProvider'
import { NotificationCard } from '@/components/notifications/NotificationCard'
import { formToPayload, emptyEventForm, eventToForm } from '@/components/events/eventFormUtils'
import AnalyticsPage from '@/pages/analytics/AnalyticsPage'
import AssistantPage from '@/pages/assistant/AssistantPage'
import WeekPage from '@/pages/week/WeekPage'
import { askAssistant, confirmAssistantAction } from '@/services/assistantApi'
import { getAnalytics, getWeek } from '@/services/analyticsApi'

vi.mock('@/services/assistantApi', () => ({ askAssistant: vi.fn(), confirmAssistantAction: vi.fn() }))
vi.mock('@/services/analyticsApi', () => ({ getWeek: vi.fn(), getAnalytics: vi.fn() }))

const shell = (ui) => render(<MemoryRouter><EventsProvider>{ui}</EventsProvider></MemoryRouter>)

describe('notification card: priority and snooze', () => {
  const base = { id: 'n1', eventId: 'e1', type: 'DEPARTURE_NOW', category: 'departure', title: 'Time to leave', body: 'Leave now', read: false, createdAt: new Date().toISOString(), priority: 'urgent', snoozedUntil: null }

  it('shows the priority and offers snooze choices on an unread notification', async () => {
    const onSnooze = vi.fn()
    render(<MemoryRouter><ul><NotificationCard notification={base} onMarkRead={() => {}} onSnooze={onSnooze} /></ul></MemoryRouter>)
    expect(screen.getByText('urgent')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText(/Snooze "Time to leave"/), '1h')
    expect(onSnooze).toHaveBeenCalledWith('n1', '1h')
  })

  it('a snoozed notification shows until when and can be un-snoozed; it is not offered a second snooze', async () => {
    const onUnsnooze = vi.fn()
    const snoozed = { ...base, priority: 'normal', snoozedUntil: new Date(Date.now() + 3_600_000).toISOString() }
    render(<MemoryRouter><ul><NotificationCard notification={snoozed} onSnooze={() => {}} onUnsnooze={onUnsnooze} /></ul></MemoryRouter>)
    expect(screen.getByText(/Snoozed until/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Snooze "/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Cancel snooze/ }))
    expect(onUnsnooze).toHaveBeenCalledWith('n1')
  })

  it('a read notification offers no snooze (the server would refuse it)', () => {
    render(<MemoryRouter><ul><NotificationCard notification={{ ...base, read: true }} onSnooze={() => {}} /></ul></MemoryRouter>)
    expect(screen.queryByLabelText(/^Snooze "/)).not.toBeInTheDocument()
  })
})

describe('assistant page', () => {
  beforeEach(() => vi.clearAllMocks())
  const answer = (over = {}) => ({ supported: true, intent: 'start_prep', source: 'rules', aiStatus: 'not_configured', answer: 'Start preparing for "Interview" at 8:00 AM on 2030-05-10.', estimate: false, basedOn: ['Your saved event times'], uncertainty: 'Live traffic is not available.', ...over })

  it('labels a rules-based answer, shows the reason and the uncertainty', async () => {
    askAssistant.mockResolvedValue(answer())
    shell(<AssistantPage />)
    await userEvent.type(screen.getByLabelText('Your question'), 'When should I start preparing for my interview?')
    await userEvent.click(screen.getByRole('button', { name: /Ask/ }))
    expect(await screen.findByText(/Start preparing for "Interview"/)).toBeInTheDocument()
    expect(screen.getByText('Rules-based answer')).toBeInTheDocument()
    expect(screen.getByText(/Based on: Your saved event times/)).toBeInTheDocument()
    expect(screen.getByText(/Live traffic is not available/)).toBeInTheDocument()
    expect(askAssistant).toHaveBeenCalledWith('When should I start preparing for my interview?', undefined)
  })

  it('labels AI-assisted wording and an estimate', async () => {
    askAssistant.mockResolvedValue(answer({ source: 'ai', aiStatus: 'used', estimate: true }))
    shell(<AssistantPage />)
    await userEvent.click(screen.getByRole('button', { name: /Do I have any schedule conflicts/ }))
    expect(await screen.findByText(/AI-assisted wording/)).toBeInTheDocument()
    expect(screen.getByText('Estimate')).toBeInTheDocument()
  })

  it('asks which event instead of guessing, and re-asks with the chosen event', async () => {
    askAssistant.mockResolvedValueOnce(answer({ answer: 'Which one do you mean?', clarification: [{ id: 'e1', title: 'Team meeting' }, { id: 'e2', title: 'Team lunch' }] }))
    askAssistant.mockResolvedValueOnce(answer())
    shell(<AssistantPage />)
    await userEvent.click(screen.getByRole('button', { name: /When should I start preparing/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Team lunch' }))
    await waitFor(() => expect(askAssistant).toHaveBeenCalledTimes(2))
    expect(askAssistant.mock.calls[1][1]).toBe('e2')
  })

  it('a proposed change changes nothing until the user confirms', async () => {
    askAssistant.mockResolvedValue(answer({ proposal: { action: 'set_preparation', label: 'Change preparation for "Interview" from 30 to 45 min', token: 'signed-token', to: 45 } }))
    confirmAssistantAction.mockResolvedValue({ applied: true, preparationMinutes: 45 })
    shell(<AssistantPage />)
    await userEvent.click(screen.getByRole('button', { name: /When should I start preparing/ }))
    expect(await screen.findByText(/Change preparation for "Interview"/)).toBeInTheDocument()
    expect(confirmAssistantAction).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /Confirm change/ }))
    expect(confirmAssistantAction).toHaveBeenCalledWith('signed-token')
    expect(await screen.findByText(/preparation is now 45 min/)).toBeInTheDocument()
  })

  it('declining a proposal never calls the server', async () => {
    askAssistant.mockResolvedValue(answer({ proposal: { action: 'set_preparation', label: 'Change it', token: 't', to: 45 } }))
    shell(<AssistantPage />)
    await userEvent.click(screen.getByRole('button', { name: /When should I start preparing/ }))
    await userEvent.click(await screen.findByRole('button', { name: /No thanks/ }))
    expect(screen.getByText(/Nothing was changed/)).toBeInTheDocument()
    expect(confirmAssistantAction).not.toHaveBeenCalled()
  })

  it('shows a refused confirmation (expired / changed event) as an error and keeps the change unapplied', async () => {
    askAssistant.mockResolvedValue(answer({ proposal: { action: 'set_preparation', label: 'Change it', token: 't', to: 45 } }))
    confirmAssistantAction.mockRejectedValue(new Error('This confirmation is invalid or has expired.'))
    shell(<AssistantPage />)
    await userEvent.click(screen.getByRole('button', { name: /When should I start preparing/ }))
    await userEvent.click(await screen.findByRole('button', { name: /Confirm change/ }))
    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument()
  })

  it('shows API failures (rate limit, offline) without breaking the page, and rejects tiny questions client-side', async () => {
    askAssistant.mockRejectedValue(new Error('Too many attempts. Please try again later.'))
    shell(<AssistantPage />)
    expect(screen.getByRole('button', { name: /Ask/ })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Your question'), 'when should I leave')
    await userEvent.click(screen.getByRole('button', { name: /Ask/ }))
    expect(await screen.findByText(/Too many attempts/)).toBeInTheDocument()
  })
})

describe('weekly planner page', () => {
  const week = (over = {}) => ({
    weekStart: '2030-05-06', weekEnd: '2030-05-12', timezone: 'Asia/Dhaka',
    days: Array.from({ length: 7 }, (_, i) => ({ date: `2030-05-${String(6 + i).padStart(2, '0')}`, label: `Day ${i + 1}`, isToday: i === 1, events: [], workloadMinutes: 0 })),
    summary: { events: 0, conflicts: 0, workloadMinutes: 0, busiestDay: null, highPriority: 0 },
    conflictAssumptions: ['Events without a duration are assumed to last 60 minutes.'], upcoming: [], ...over,
  })
  const ev = (over = {}) => ({ id: 'e1', title: 'Interview', category: 'interview', priority: 'high', startAt: '2030-05-07T04:00:00Z', startTime: '10:00 AM', departureTime: '9:15 AM', preparationMinutes: 40, hasConflict: true, isPast: false, ...over })

  it('a new user sees a useful empty state, not zeros pretending to be data', async () => {
    getWeek.mockResolvedValue(week())
    shell(<WeekPage />)
    expect(await screen.findByText('Nothing planned this week')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add an event' })).toHaveAttribute('href', '/events/new')
  })

  it('shows events with priority, conflict flag and daily workload', async () => {
    const w = week({ summary: { events: 1, conflicts: 1, workloadMinutes: 40, busiestDay: '2030-05-07', highPriority: 1 } })
    w.days[1] = { ...w.days[1], events: [ev()], workloadMinutes: 40 }
    getWeek.mockResolvedValue(w)
    shell(<WeekPage />)
    const day = await screen.findByRole('region', { name: 'Day 2' })
    expect(within(day).getByRole('link', { name: 'Interview' })).toBeInTheDocument()
    expect(within(day).getByText('High priority')).toBeInTheDocument()
    expect(within(day).getByText('Conflict')).toBeInTheDocument()
    expect(within(day).getByText('40 min')).toBeInTheDocument()
    expect(screen.getByText(/assumed to last 60 minutes/)).toBeInTheDocument()
  })

  it('moves between weeks by asking the server for that week', async () => {
    getWeek.mockResolvedValue(week())
    shell(<WeekPage />)
    await screen.findByText('Nothing planned this week')
    await userEvent.click(screen.getByRole('button', { name: 'Next week' }))
    await waitFor(() => expect(getWeek).toHaveBeenLastCalledWith('2030-05-13'))
    await userEvent.click(screen.getByRole('button', { name: 'This week' }))
    await waitFor(() => expect(getWeek).toHaveBeenLastCalledWith(undefined))
  })
})

describe('analytics page', () => {
  const insufficient = { status: 'insufficient_data', samples: 1, needed: 3 }
  const data = (over = {}) => ({
    hasEvents: true, preparationTracking: 'available', totals: { scheduled: 5, past: 4, upcoming: 1 },
    preparation: { completion: { status: 'ok', percent: 75, count: 3, of: 4 }, average: { status: 'ok', minutes: 30, samples: 3 }, loggedSessions: 3 },
    departure: { onTime: insufficient, graceMinutes: 5 },
    checklist: { rate: { status: 'ok', percent: 80, count: 4, of: 5 }, totalItems: 5, doneItems: 4, completedInRange: null },
    trend: [{ key: '2030-05-06', label: 'Week of May 6', start: '', events: 3, preparationCompletion: null, averagePrep: { status: 'ok', minutes: 30, samples: 3 }, onTime: insufficient, checklist: { status: 'ok', percent: 80 } }],
    notes: ['A figure appears once there are at least 3 data points.'], ...over,
  })

  it('shows real figures where there is enough data and an honest "not enough data" where there is not', async () => {
    getAnalytics.mockResolvedValue(data())
    shell(<AnalyticsPage />)
    expect(await screen.findByText('75%')).toBeInTheDocument()
    expect(screen.getByText('30 min')).toBeInTheDocument()
    expect(screen.getByText('80%', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText(/Not enough data yet \(1 of 3\)/)).toBeInTheDocument() // left on time
  })

  it('shows how many checklist items were ticked in the chosen period (when the server can tell)', async () => {
    getAnalytics.mockResolvedValue(data({ checklist: { rate: { status: 'ok', percent: 80, count: 4, of: 5 }, totalItems: 5, doneItems: 4, completedInRange: 3 } }))
    shell(<AnalyticsPage />)
    expect(await screen.findByText('4 of 5 items · 3 ticked in this period')).toBeInTheDocument()
  })

  it('does not mention ticked-in-period when it is not available (older data has no completion time)', async () => {
    getAnalytics.mockResolvedValue(data({ checklist: { rate: { status: 'ok', percent: 80, count: 4, of: 5 }, totalItems: 5, doneItems: 4, completedInRange: null } }))
    shell(<AnalyticsPage />)
    expect(await screen.findByText('4 of 5 items')).toBeInTheDocument()
    expect(screen.queryByText(/ticked in this period/)).not.toBeInTheDocument()
  })

  it('a brand-new user gets an empty state that explains how to start', async () => {
    getAnalytics.mockResolvedValue(data({ hasEvents: false }))
    shell(<AnalyticsPage />)
    expect(await screen.findByText('No events in this period')).toBeInTheDocument()
    expect(screen.getByText(/at least 3 data points/)).toBeInTheDocument()
  })

  it('hides preparation figures instead of showing zero when tracking is unavailable', async () => {
    getAnalytics.mockResolvedValue(data({ preparationTracking: 'unavailable', preparation: null, departure: null }))
    shell(<AnalyticsPage />)
    expect(await screen.findByText(/Preparation tracking is not available yet/)).toBeInTheDocument()
    expect(screen.queryByText('Left on time')).not.toBeInTheDocument()
  })

  it('filters by date range and interval, and refuses an inverted range without calling the server', async () => {
    getAnalytics.mockResolvedValue(data())
    shell(<AnalyticsPage />)
    await screen.findByText('75%')
    await userEvent.click(screen.getByRole('radio', { name: 'Monthly' }))
    await waitFor(() => expect(getAnalytics).toHaveBeenLastCalledWith(expect.objectContaining({ granularity: 'month' })))
    const calls = getAnalytics.mock.calls.length
    const from = screen.getByLabelText('From')
    await userEvent.clear(from)
    await userEvent.type(from, '2999-01-01')
    expect(await screen.findByText(/not after the end date/)).toBeInTheDocument()
    expect(getAnalytics.mock.calls.length).toBe(calls)
  })
})

describe('event priority in the form payload', () => {
  const filled = { ...emptyEventForm({ timezone: 'Asia/Dhaka' }), title: 'x', category: 'office', date: '2030-05-10', startTime: '10:00', travelMinutes: '20' }
  it('is not sent when untouched (so saving never touches a field the user did not change)', () => {
    expect(formToPayload(filled)).not.toHaveProperty('priority')
  })
  it('is sent when the user changes it', () => {
    expect(formToPayload({ ...filled, priority: 'high' })).toMatchObject({ priority: 'high' })
  })
  it('editing starts from the event\'s own priority and sends only a change', () => {
    const event = { title: 'x', category: 'office', localDate: '2030-05-10', localTime: '10:00', travelDurationMinutes: 20, preparationMinutes: 30, arrivalBufferMinutes: 10, timezone: 'Asia/Dhaka', priority: 'high' }
    const form = eventToForm(event)
    expect(form.priority).toBe('high')
    expect(formToPayload(form)).not.toHaveProperty('priority')
    expect(formToPayload({ ...form, priority: 'low' })).toMatchObject({ priority: 'low' })
  })
})
