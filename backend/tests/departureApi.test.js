import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import { prisma } from '../src/config/database.js'
import { api, bearer, registerAndLogin } from './helpers.js'

const TZ = 'Asia/Dhaka'
const MIN = 60_000
const baseEvent = (overrides = {}) => ({
  title: 'Database Systems Class',
  category: 'university',
  startAt: '2030-05-10T10:00', // local wall time in `timezone`
  timezone: TZ,
  destination: 'Engineering Building',
  travelDurationMinutes: 35,
  preparationMinutes: 30,
  arrivalBufferMinutes: 10,
  ...overrides,
})
const create = async (token, overrides) => (await api().post('/api/events').set(bearer(token)).send(baseEvent(overrides))).body.data.event
const plan = (token, id, qs = '') => api().get(`/api/events/${id}/departure-plan${qs}`).set(bearer(token))
const preview = (token, body) => api().post('/api/departure/preview').set(bearer(token)).send(body)
const get = (token, path) => api().get(path).set(bearer(token))
/** An event that starts `minutes` from now (absolute instant, so it is timezone independent). */
const startingIn = (minutes) => new Date(Date.now() + minutes * MIN).toISOString()
const local = (dt) => dt.toFormat("yyyy-MM-dd'T'HH:mm")

describe('authentication and routing', () => {
  it.each([
    ['get', '/api/events/00000000-0000-4000-8000-000000000000/departure-plan'],
    ['post', '/api/departure/preview'],
    ['get', '/api/departure/today'],
    ['get', '/api/departure/upcoming'],
  ])('%s %s requires authentication (401)', async (method, url) => {
    expect((await api()[method](url)).status).toBe(401)
  })

  it('the new routes do not shadow or break the existing event routes', async () => {
    const { token } = await registerAndLogin()
    const event = await create(token)
    expect((await get(token, `/api/events/${event.id}`)).status).toBe(200)
    expect((await get(token, '/api/events/upcoming')).status).toBe(200)
    expect((await get(token, '/api/events/occurrences?from=2030-05-01&to=2030-05-31')).status).toBe(200)
    expect((await get(token, '/api/departure/upcoming')).status).toBe(200)
    expect((await get(token, '/api/departure/unknown')).status).toBe(404)
  })
})

describe('GET /api/events/:id/departure-plan', () => {
  it('returns the exact plan from the stored event values, with an explanation (the 10:00 AM example)', async () => {
    const { token } = await registerAndLogin()
    const event = await create(token)
    const res = await plan(token, event.id)
    expect(res.status).toBe(200)
    const d = res.body.data

    expect(d.event).toMatchObject({ id: event.id, title: 'Database Systems Class', timezone: TZ, startAt: '2030-05-10T04:00:00.000Z', isRecurring: false })
    expect(d.plan).toEqual({
      preparationStart: '2030-05-10T02:45:00.000Z',
      departureTime: '2030-05-10T03:15:00.000Z',
      targetArrival: '2030-05-10T03:50:00.000Z',
      eventStart: '2030-05-10T04:00:00.000Z',
    })
    expect(d.local).toMatchObject({
      timezone: TZ,
      preparationStart: { date: '2030-05-10', time: '08:45', time12: '8:45 AM' },
      departureTime: { time12: '9:15 AM' },
      targetArrival: { time12: '9:50 AM' },
      eventStart: { time12: '10:00 AM' },
    })
    expect(d.durations).toEqual({ preparationMinutes: 30, travelDurationMinutes: 35, arrivalBufferMinutes: 10, totalRequiredMinutes: 75 })
    expect(d.status).toBe('UPCOMING')
    expect(d.explanation).toBe('Start preparing at 8:45 AM and leave at 9:15 AM to arrive 10 minutes before your event.')
    expect(d.readiness.nextMilestone).toMatchObject({ key: 'preparationStart', at: '2030-05-10T02:45:00.000Z' })
    expect(d.readiness.nextMilestone.secondsUntil).toBeGreaterThan(0)
    expect(new Date(d.calculatedAt).getTime()).toBeLessThanOrEqual(Date.now())
    expect(JSON.stringify(res.body)).not.toMatch(/userId|user_id|recurrenceRuleId|passwordHash/)
  })

  it('shows the event in ITS timezone and handles a different zone (New York) correctly', async () => {
    const { token } = await registerAndLogin()
    const event = await create(token, { timezone: 'America/New_York' })
    const d = (await plan(token, event.id)).body.data
    expect(d.plan.eventStart).toBe('2030-05-10T14:00:00.000Z') // 10:00 EDT (UTC-4) in May
    expect(d.local).toMatchObject({ timezone: 'America/New_York', preparationStart: { time12: '8:45 AM' }, eventStart: { time12: '10:00 AM' } })
    expect(d.local.eventStart.iso).toMatch(/-04:00$/)
  })

  it('explains a plan that crosses midnight', async () => {
    const { token } = await registerAndLogin()
    const event = await create(token, { startAt: '2030-05-11T00:10' })
    const d = (await plan(token, event.id)).body.data
    expect(d.local.preparationStart).toMatchObject({ date: '2030-05-10', time12: '10:55 PM' })
    expect(d.explanation).toBe('Start preparing at 10:55 PM (the day before) and leave at 11:25 PM (the day before) to arrive 10 minutes before your event.')
  })

  it.each([
    ['PREPARING', 70, 'preparation began'],
    ['READY_TO_LEAVE', 40, 'past your departure time'],
    ['ARRIVAL_TARGET_PASSED', 5, 'target arrival time'],
    ['EVENT_STARTED', -5, 'This event started'],
  ])('reports %s with a useful message', async (status, startsInMinutes, phrase) => {
    const { token } = await registerAndLogin()
    const event = await create(token, { startAt: startingIn(startsInMinutes) }) // prep 30 + travel 35 + buffer 10 = 75 min lead
    const d = (await plan(token, event.id)).body.data
    expect(d.status).toBe(status)
    expect(d.readiness.message).toContain(phrase)
    if (status === 'EVENT_STARTED') expect(d.readiness.nextMilestone).toBeNull()
    else expect(d.readiness.nextMilestone.secondsUntil).toBeGreaterThanOrEqual(0)
  })

  it('never returns a negative countdown, even for an event far in the past', async () => {
    const { token } = await registerAndLogin()
    const event = await create(token, { startAt: '2020-01-01T10:00' })
    const d = (await plan(token, event.id)).body.data
    expect(d.status).toBe('EVENT_STARTED')
    expect(d.readiness.nextMilestone).toBeNull()
    expect(d.readiness.minutesPastDeparture).toBeGreaterThan(0)
    expect(d.readiness.message).not.toMatch(/-\d/)
  })

  it('is read-only: it never changes the saved event', async () => {
    const { token } = await registerAndLogin()
    const event = await create(token)
    const before = await prisma.event.findUnique({ where: { id: event.id } })
    await plan(token, event.id)
    const after = await prisma.event.findUnique({ where: { id: event.id } })
    expect(after).toEqual(before)
  })

  it("returns 404 for another user's event, for an unknown id, and 400 for a malformed id", async () => {
    const a = await registerAndLogin()
    const b = await registerAndLogin()
    const event = await create(a.token)
    const other = await plan(b.token, event.id)
    expect(other.status).toBe(404)
    expect(JSON.stringify(other.body)).not.toContain('Database Systems Class')
    expect((await plan(a.token, '00000000-0000-4000-8000-000000000000')).status).toBe(404)
    expect((await plan(a.token, 'not-a-uuid')).status).toBe(400)
  })

  it('a deleted event has no plan (404)', async () => {
    const { token } = await registerAndLogin()
    const event = await create(token)
    await api().delete(`/api/events/${event.id}`).set(bearer(token))
    expect((await plan(token, event.id)).status).toBe(404)
  })

  it('recurring events: defaults to the NEXT occurrence, accepts a valid occurrence, rejects an invalid one', async () => {
    const { token } = await registerAndLogin()
    const start = DateTime.now().setZone(TZ).minus({ days: 3 }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
    const event = await create(token, { startAt: local(start), recurrence: { frequency: 'DAILY' } })

    const d = (await plan(token, event.id)).body.data
    const startMs = new Date(d.event.startAt).getTime()
    expect(startMs).toBeGreaterThan(Date.now())
    expect(startMs - Date.now()).toBeLessThanOrEqual(24 * 60 * MIN)
    expect(d.event).toMatchObject({ isRecurring: true })
    expect(d.local.eventStart.time).toBe('09:00')

    const valid = await plan(token, event.id, `?occurrence=${encodeURIComponent(d.event.startAt)}`)
    expect(valid.status).toBe(200)
    expect(valid.body.data.event.startAt).toBe(d.event.startAt)

    const wrongTime = new Date(startMs + 30 * MIN).toISOString()
    expect((await plan(token, event.id, `?occurrence=${encodeURIComponent(wrongTime)}`)).status).toBe(400)
    expect((await plan(token, event.id, '?occurrence=yesterday')).status).toBe(400)
  })
})

describe('POST /api/departure/preview', () => {
  it('calculates with the same engine and creates NOTHING in the database', async () => {
    const { token, user } = await registerAndLogin()
    const counts = async () => ({
      events: await prisma.event.count({ where: { userId: user.id } }),
      rules: await prisma.recurrenceRule.count({ where: { userId: user.id } }),
      logs: await prisma.emailLog.count({ where: { userId: user.id } }),
    })
    const before = await counts()
    const res = await preview(token, { startAt: '2030-05-10T10:00', timezone: TZ, travelDurationMinutes: 35, preparationMinutes: 30, arrivalBufferMinutes: 10 })
    expect(res.status).toBe(200)
    expect(await counts()).toEqual(before)

    const d = res.body.data
    expect(d.event).toMatchObject({ id: null, title: null, startAt: '2030-05-10T04:00:00.000Z', timezone: TZ })
    expect(d.local).toMatchObject({ preparationStart: { time12: '8:45 AM' }, departureTime: { time12: '9:15 AM' }, targetArrival: { time12: '9:50 AM' } })
    expect(d.durations.totalRequiredMinutes).toBe(75)
  })

  it('gives exactly the same result as a saved event with the same values', async () => {
    const { token } = await registerAndLogin()
    const event = await create(token)
    const saved = (await plan(token, event.id)).body.data
    const previewed = (await preview(token, { startAt: '2030-05-10T10:00', timezone: TZ, travelDurationMinutes: 35, preparationMinutes: 30, arrivalBufferMinutes: 10 })).body.data
    expect(previewed.plan).toEqual(saved.plan)
    expect(previewed.local).toEqual(saved.local)
    expect(previewed.durations).toEqual(saved.durations)
    expect(previewed.explanation).toBe(saved.explanation)
  })

  it('falls back: preparation/buffer from the user preferences, timezone from the user preference', async () => {
    const { token } = await registerAndLogin()
    await api().patch('/api/users/me/preferences').set(bearer(token)).send({ defaultPreparationMinutes: 45, defaultArrivalBufferMinutes: 20, timezone: 'America/New_York' })
    const d = (await preview(token, { startAt: '2030-05-10T10:00', travelDurationMinutes: 30 })).body.data
    expect(d.durations).toEqual({ preparationMinutes: 45, travelDurationMinutes: 30, arrivalBufferMinutes: 20, totalRequiredMinutes: 95 })
    expect(d.event.timezone).toBe('America/New_York')
    expect(d.plan.eventStart).toBe('2030-05-10T14:00:00.000Z')
    // explicit values always win over preferences, including an explicit 0
    const explicit = (await preview(token, { startAt: '2030-05-10T10:00', timezone: TZ, travelDurationMinutes: 30, preparationMinutes: 0, arrivalBufferMinutes: 0 })).body.data
    expect(explicit.durations).toMatchObject({ preparationMinutes: 0, arrivalBufferMinutes: 0 })
    expect(explicit.event.timezone).toBe(TZ)
    expect(explicit.explanation).toBe('Leave at 9:30 AM to arrive when your event starts. No preparation time is set.')
  })

  it('falls back to the documented application defaults and Asia/Dhaka for a user with default preferences', async () => {
    const { token } = await registerAndLogin() // preferences: prep 30, buffer 10, Asia/Dhaka
    const d = (await preview(token, { startAt: '2030-05-10T10:00', travelDurationMinutes: 35 })).body.data
    expect(d.durations).toMatchObject({ preparationMinutes: 30, arrivalBufferMinutes: 10 })
    expect(d.event.timezone).toBe('Asia/Dhaka')
    expect(d.local.preparationStart.time12).toBe('8:45 AM')
  })

  it('reports a status for the previewed time too (a past time is EVENT_STARTED)', async () => {
    const { token } = await registerAndLogin()
    const d = (await preview(token, { startAt: '2020-01-01T10:00', travelDurationMinutes: 35 })).body.data
    expect(d.status).toBe('EVENT_STARTED')
  })

  it.each([
    ['negative travel', { travelDurationMinutes: -1 }, 'travelDurationMinutes'],
    ['zero travel', { travelDurationMinutes: 0 }, 'travelDurationMinutes'],
    ['fractional travel', { travelDurationMinutes: 12.5 }, 'travelDurationMinutes'],
    ['string travel', { travelDurationMinutes: '35' }, 'travelDurationMinutes'],
    ['missing travel', { travelDurationMinutes: undefined }, 'travelDurationMinutes'],
    ['absurd travel', { travelDurationMinutes: 100000 }, 'travelDurationMinutes'],
    ['negative preparation', { preparationMinutes: -5 }, 'preparationMinutes'],
    ['negative buffer', { arrivalBufferMinutes: -5 }, 'arrivalBufferMinutes'],
    ['malformed date', { startAt: 'tomorrow' }, 'startAt'],
    ['impossible date', { startAt: '2030-02-30T10:00' }, 'startAt'],
    ['missing date', { startAt: undefined }, 'startAt'],
    ['unknown timezone', { timezone: 'Mars/Phobos' }, 'timezone'],
    ['a userId', { userId: '00000000-0000-4000-8000-000000000000' }, 'body'],
  ])('rejects %s (400)', async (_name, patch, field) => {
    const { token } = await registerAndLogin()
    const res = await preview(token, { startAt: '2030-05-10T10:00', travelDurationMinutes: 35, ...patch })
    expect(res.status).toBe(400)
    expect(res.body.errors.some((e) => e.field === field || field === 'body')).toBe(true)
  })
})

describe('GET /api/departure/today', () => {
  it("returns only the user's plans for their local day, including plans whose preparation starts before midnight, sorted by departure", async () => {
    const a = await registerAndLogin()
    const b = await registerAndLogin()
    const now = DateTime.now().setZone(TZ)
    const day = now.startOf('day')

    const noon = await create(a.token, { title: 'Noon', startAt: local(day.plus({ hours: 12 })), travelDurationMinutes: 30, preparationMinutes: 0, arrivalBufferMinutes: 0 })
    // starts at 00:30 TOMORROW, but preparation begins at 22:30 TODAY (90 prep + 30 travel)
    const crossing = await create(a.token, { title: 'Crossing midnight', startAt: local(day.plus({ days: 1, minutes: 30 })), travelDurationMinutes: 30, preparationMinutes: 90, arrivalBufferMinutes: 0 })
    await create(a.token, { title: 'Yesterday', startAt: local(day.minus({ hours: 12 })) })
    await create(a.token, { title: 'Tomorrow noon', startAt: local(day.plus({ days: 1, hours: 12 })), preparationMinutes: 30 })
    await create(b.token, { title: 'Bob private', startAt: local(day.plus({ hours: 12 })) })

    const res = await get(a.token, '/api/departure/today')
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ date: day.toFormat('yyyy-MM-dd'), timezone: TZ })
    expect(res.body.data.plans.map((p) => p.event.title)).toEqual(['Noon', 'Crossing midnight'])
    expect(res.body.data.plans.map((p) => p.event.id)).toEqual([noon.id, crossing.id])
    const departures = res.body.data.plans.map((p) => p.plan.departureTime)
    expect([...departures].sort()).toEqual(departures)
    expect(JSON.stringify(res.body)).not.toContain('Bob private')
  })

  it('uses the user timezone preference, and accepts an explicit timezone override', async () => {
    const { token } = await registerAndLogin()
    await api().patch('/api/users/me/preferences').set(bearer(token)).send({ timezone: 'Pacific/Auckland' })
    const res = await get(token, '/api/departure/today')
    expect(res.body.data.timezone).toBe('Pacific/Auckland')
    expect(res.body.data.date).toBe(DateTime.now().setZone('Pacific/Auckland').toFormat('yyyy-MM-dd'))
    const override = await get(token, '/api/departure/today?timezone=America/New_York')
    expect(override.body.data.timezone).toBe('America/New_York')
    expect((await get(token, '/api/departure/today?timezone=Nope/Zone')).status).toBe(400)
  })

  it('returns an empty list for a user without events and omits deleted events', async () => {
    const { token } = await registerAndLogin()
    expect((await get(token, '/api/departure/today')).body.data.plans).toEqual([])
    const day = DateTime.now().setZone(TZ).startOf('day')
    const event = await create(token, { startAt: local(day.plus({ hours: 12 })) })
    expect((await get(token, '/api/departure/today')).body.data.plans).toHaveLength(1)
    await api().delete(`/api/events/${event.id}`).set(bearer(token))
    expect((await get(token, '/api/departure/today')).body.data.plans).toEqual([])
  })
})

describe('GET /api/departure/upcoming', () => {
  it('sorts by DEPARTURE time (not start time), applies limit and window, and excludes past events', async () => {
    const { token } = await registerAndLogin()
    // B starts later than A but has 10 hours of travel, so you must leave for B first.
    await create(token, { title: 'A starts +6h', startAt: startingIn(6 * 60), travelDurationMinutes: 30, preparationMinutes: 0, arrivalBufferMinutes: 0 })
    await create(token, { title: 'B starts +12h, long trip', startAt: startingIn(12 * 60), travelDurationMinutes: 600, preparationMinutes: 0, arrivalBufferMinutes: 0 })
    await create(token, { title: 'C starts +30h', startAt: startingIn(30 * 60), travelDurationMinutes: 30, preparationMinutes: 0, arrivalBufferMinutes: 0 })
    await create(token, { title: 'Past', startAt: '2020-01-01T10:00' })

    const all = (await get(token, '/api/departure/upcoming?days=3')).body.data
    expect(all.plans.map((p) => p.event.title)).toEqual(['B starts +12h, long trip', 'A starts +6h', 'C starts +30h'])
    expect((await get(token, '/api/departure/upcoming?days=3&limit=2')).body.data.plans).toHaveLength(2)
    expect((await get(token, '/api/departure/upcoming?days=1')).body.data.plans.map((p) => p.event.title)).toEqual(['B starts +12h, long trip', 'A starts +6h'])
    expect(new Date(all.to) - new Date(all.from)).toBe(3 * 86_400_000)
  })

  it('expands recurring events into distinct occurrences without duplicates', async () => {
    const { token } = await registerAndLogin()
    const start = DateTime.now().setZone(TZ).minus({ days: 2 }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
    await create(token, { title: 'Standup', startAt: local(start), recurrence: { frequency: 'DAILY' } })
    const plans = (await get(token, '/api/departure/upcoming?days=4')).body.data.plans
    expect(plans.length).toBeGreaterThanOrEqual(3)
    expect(plans.length).toBeLessThanOrEqual(5)
    const starts = plans.map((p) => p.event.startAt)
    expect(new Set(starts).size).toBe(starts.length)
    expect([...starts].sort()).toEqual(starts)
    expect(plans.every((p) => p.event.title === 'Standup' && p.local.eventStart.time === '09:00')).toBe(true)
  })

  it("never includes another user's events, and rejects invalid parameters", async () => {
    const a = await registerAndLogin()
    const b = await registerAndLogin()
    await create(a.token, { title: 'Alice only', startAt: startingIn(120) })
    expect((await get(b.token, '/api/departure/upcoming')).body.data.plans).toEqual([])
    for (const qs of ['days=0', 'days=31', 'days=abc', 'limit=0', 'limit=101']) {
      expect((await get(a.token, `/api/departure/upcoming?${qs}`)).status, qs).toBe(400)
    }
  })

  it('uses the same engine and values as the single-event plan', async () => {
    const { token } = await registerAndLogin()
    const event = await create(token, { startAt: startingIn(300) })
    const [fromList] = (await get(token, '/api/departure/upcoming')).body.data.plans
    const single = (await plan(token, event.id)).body.data
    expect(fromList.plan).toEqual(single.plan)
    expect(fromList.durations).toEqual(single.durations)
    expect(fromList.explanation).toBe(single.explanation)
  })
})
