import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import { prisma } from '../src/config/database.js'
import { api, bearer, registerAndLogin } from './helpers.js'

const TZ = 'Asia/Dhaka'
const baseEvent = (overrides = {}) => ({
  title: 'Database Systems Class',
  category: 'university',
  startAt: '2030-05-10T10:00',
  timezone: TZ,
  destination: 'Engineering Building',
  notes: 'Bring the lab sheet',
  travelDurationMinutes: 35,
  preparationMinutes: 30,
  arrivalBufferMinutes: 10,
  ...overrides,
})
const create = (token, overrides) => api().post('/api/events').set(bearer(token)).send(baseEvent(overrides))
const makeEvent = async (token, overrides) => (await create(token, overrides)).body.data.event
/** Local wall-time string (in TZ) N days from now at the given hour. */
const inDays = (n, hour = 10) => DateTime.now().setZone(TZ).plus({ days: n }).set({ hour, minute: 0, second: 0, millisecond: 0 }).toFormat("yyyy-MM-dd'T'HH:mm")

describe('POST /api/events', () => {
  it('creates an event, stores a UTC instant and returns local parts (201)', async () => {
    const { token, user } = await registerAndLogin()
    const res = await create(token)
    expect(res.status).toBe(201)
    const e = res.body.data.event
    expect(e).toMatchObject({
      title: 'Database Systems Class',
      category: 'university',
      timezone: TZ,
      startAt: '2030-05-10T04:00:00.000Z', // 10:00 in Dhaka (UTC+6) -> 04:00 UTC
      localDate: '2030-05-10',
      localTime: '10:00',
      travelDurationMinutes: 35,
      isRecurring: false,
      recurrence: null,
    })
    expect(JSON.stringify(res.body)).not.toMatch(/userId|user_id|recurrenceRuleId/)

    const row = await prisma.event.findUnique({ where: { id: e.id } })
    expect(row.userId).toBe(user.id)
    expect(row.startAt.toISOString()).toBe('2030-05-10T04:00:00.000Z')
  })

  it('defaults the timezone to the user preference and trims text', async () => {
    const { token } = await registerAndLogin()
    await api().patch('/api/users/me/preferences').set(bearer(token)).send({ timezone: 'America/New_York' })
    const { timezone, ...noTz } = baseEvent({ title: '  Padded  ', destination: '   ', startAt: '2030-01-15T09:00' })
    expect(timezone).toBe(TZ)
    const res = await api().post('/api/events').set(bearer(token)).send(noTz)
    expect(res.status).toBe(201)
    expect(res.body.data.event).toMatchObject({ title: 'Padded', destination: null, timezone: 'America/New_York', startAt: '2030-01-15T14:00:00.000Z' })
  })

  it('accepts an absolute instant and keeps the intended local time in the event timezone', async () => {
    const { token } = await registerAndLogin()
    const res = await create(token, { startAt: '2030-05-10T04:00:00Z' })
    expect(res.status).toBe(201)
    expect(res.body.data.event).toMatchObject({ localTime: '10:00', startAt: '2030-05-10T04:00:00.000Z' })
  })

  it.each([
    ['missing title', { title: undefined }, 'title'],
    ['blank title', { title: '   ' }, 'title'],
    ['title too long', { title: 'x'.repeat(151) }, 'title'],
    ['invalid category', { category: 'party' }, 'category'],
    ['invalid date', { startAt: '2030-02-30T10:00' }, 'startAt'],
    ['malformed date', { startAt: 'tomorrow' }, 'startAt'],
    ['missing date', { startAt: undefined }, 'startAt'],
    ['invalid timezone', { timezone: 'Mars/Phobos' }, 'timezone'],
    ['negative travel', { travelDurationMinutes: -5 }, 'travelDurationMinutes'],
    ['zero travel', { travelDurationMinutes: 0 }, 'travelDurationMinutes'],
    ['fractional travel', { travelDurationMinutes: 1.5 }, 'travelDurationMinutes'],
    ['string travel', { travelDurationMinutes: '35' }, 'travelDurationMinutes'],
    ['negative preparation', { preparationMinutes: -1 }, 'preparationMinutes'],
    ['negative buffer', { arrivalBufferMinutes: -1 }, 'arrivalBufferMinutes'],
    ['huge buffer', { arrivalBufferMinutes: 99999 }, 'arrivalBufferMinutes'],
    ['notes too long', { notes: 'n'.repeat(2001) }, 'notes'],
  ])('rejects %s (400)', async (_name, overrides, field) => {
    const { token } = await registerAndLogin()
    const res = await create(token, overrides)
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.errors.some((e) => e.field === field)).toBe(true)
  })

  it.each([
    ['unsupported frequency', { frequency: 'MONTHLY' }],
    ['zero interval', { frequency: 'DAILY', interval: 0 }],
    ['fractional interval', { frequency: 'DAILY', interval: 1.5 }],
    ['interval too large', { frequency: 'DAILY', interval: 53 }],
    ['weekday out of range', { frequency: 'WEEKLY', daysOfWeek: [8] }],
    ['empty weekdays', { frequency: 'WEEKLY', daysOfWeek: [] }],
    ['weekdays on DAILY', { frequency: 'DAILY', daysOfWeek: [1] }],
    ['malformed end date', { frequency: 'DAILY', endsOn: '10/05/2030' }],
    ['impossible end date', { frequency: 'DAILY', endsOn: '2030-02-30' }],
    ['end date before start', { frequency: 'DAILY', endsOn: '2030-05-09' }],
    ['start weekday not selected', { frequency: 'WEEKLY', daysOfWeek: [1, 3] }], // 2030-05-10 is a Friday
    ['unknown recurrence field', { frequency: 'DAILY', foo: 1 }],
  ])('rejects invalid recurrence: %s (400)', async (_name, recurrence) => {
    const { token } = await registerAndLogin()
    const res = await create(token, { recurrence })
    expect(res.status).toBe(400)
    expect(res.body.errors.some((e) => e.field.startsWith('recurrence'))).toBe(true)
  })

  it('requires authentication (401) and ignores/rejects a client-supplied userId', async () => {
    expect((await api().post('/api/events').send(baseEvent())).status).toBe(401)
    const a = await registerAndLogin()
    const b = await registerAndLogin()
    const res = await create(a.token, { userId: b.user.id })
    expect(res.status).toBe(400)
    expect(await prisma.event.count({ where: { userId: b.user.id } })).toBe(0)
  })

  it('stores a recurrence rule transactionally with the event', async () => {
    const { token } = await registerAndLogin()
    const res = await create(token, { startAt: '2030-05-10T09:00', recurrence: { frequency: 'WEEKLY', daysOfWeek: [5, 1], interval: 2, endsOn: '2030-08-01' } })
    expect(res.status).toBe(201)
    expect(res.body.data.event).toMatchObject({
      isRecurring: true,
      recurrence: { frequency: 'WEEKLY', interval: 2, daysOfWeek: [1, 5], endsOn: '2030-08-01' },
    })
    expect(await prisma.recurrenceRule.count()).toBeGreaterThanOrEqual(1)
  })

  it('defaults a WEEKLY rule to the start weekday and interval to 1', async () => {
    const { token } = await registerAndLogin()
    const res = await create(token, { recurrence: { frequency: 'WEEKLY' } }) // 2030-05-10 is Friday (5)
    expect(res.body.data.event.recurrence).toMatchObject({ frequency: 'WEEKLY', interval: 1, daysOfWeek: [5], endsOn: null })
  })
})

describe('GET /api/events (list)', () => {
  it('returns only the caller events (isolation)', async () => {
    const a = await registerAndLogin()
    const b = await registerAndLogin()
    await makeEvent(a.token, { title: 'Event A' })
    await makeEvent(b.token, { title: 'Event B' })

    const listA = await api().get('/api/events').set(bearer(a.token))
    expect(listA.status).toBe(200)
    expect(listA.body.data.events.map((e) => e.title)).toEqual(['Event A'])
    const listB = await api().get('/api/events').set(bearer(b.token))
    expect(listB.body.data.events.map((e) => e.title)).toEqual(['Event B'])
  })

  it('returns an empty page with metadata when there are no events', async () => {
    const { token } = await registerAndLogin()
    const res = await api().get('/api/events').set(bearer(token))
    expect(res.body.data).toEqual({ events: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } })
  })

  it('paginates with a stable order and correct metadata', async () => {
    const { token } = await registerAndLogin()
    for (let i = 1; i <= 5; i++) await makeEvent(token, { title: `E${i}`, startAt: `2030-06-0${i}T10:00` })
    const p1 = (await api().get('/api/events?page=1&limit=2').set(bearer(token))).body.data
    const p2 = (await api().get('/api/events?page=2&limit=2').set(bearer(token))).body.data
    const p3 = (await api().get('/api/events?page=3&limit=2').set(bearer(token))).body.data
    expect(p1.pagination).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 })
    expect([...p1.events, ...p2.events, ...p3.events].map((e) => e.title)).toEqual(['E1', 'E2', 'E3', 'E4', 'E5'])
    expect(p3.events).toHaveLength(1)
    expect((await api().get('/api/events?page=9&limit=2').set(bearer(token))).body.data.events).toEqual([])
  })

  it('keeps a stable order for events that start at the same time', async () => {
    const { token } = await registerAndLogin()
    for (let i = 0; i < 4; i++) await makeEvent(token, { title: `Same${i}`, startAt: '2030-06-01T10:00' })
    const ids = async (page) => (await api().get(`/api/events?page=${page}&limit=2`).set(bearer(token))).body.data.events.map((e) => e.id)
    const all = [...(await ids(1)), ...(await ids(2))]
    expect(new Set(all).size).toBe(4)
    expect([...(await ids(1)), ...(await ids(2))]).toEqual(all)
  })

  it('filters by category and by date range, and sorts', async () => {
    const { token } = await registerAndLogin()
    await makeEvent(token, { title: 'Uni', category: 'university', startAt: '2030-05-10T10:00' })
    await makeEvent(token, { title: 'Work', category: 'office', startAt: '2030-05-11T10:00' })
    await makeEvent(token, { title: 'Doc', category: 'appointment', startAt: '2030-05-12T23:30' })

    const titles = async (qs) => (await api().get(`/api/events?${qs}`).set(bearer(token))).body.data.events.map((e) => e.title)
    expect(await titles('category=office')).toEqual(['Work'])
    expect(await titles(`from=2030-05-11&to=2030-05-12&timezone=${TZ}`)).toEqual(['Work', 'Doc']) // 23:30 is still May 12 in Dhaka
    expect(await titles(`from=2030-05-12&timezone=UTC`)).toEqual(['Doc']) // 23:30 Dhaka = 17:30 UTC, still May 12
    expect(await titles(`to=2030-05-10&timezone=${TZ}`)).toEqual(['Uni'])
    // Instants: Uni = 05-10T04:00Z (before `from`), Work = 05-11T04:00Z (inside), Doc = 05-12T17:30Z (after `to`).
    expect(await titles('from=2030-05-10T05:00:00Z&to=2030-05-11T05:00:00Z')).toEqual(['Work'])
    expect(await titles('sort=-startAt')).toEqual(['Doc', 'Work', 'Uni'])
    expect(await titles('category=office&from=2030-05-12')).toEqual([])
  })

  it.each(['limit=0', 'limit=101', 'page=0', 'page=abc', 'category=party', 'from=yesterday', 'sort=title', 'timezone=Nope/Zone'])(
    'rejects invalid query %s (400)',
    async (qs) => {
      const { token } = await registerAndLogin()
      expect((await api().get(`/api/events?${qs}`).set(bearer(token))).status).toBe(400)
    },
  )

  it('rejects a reversed date range (400) and requires auth (401)', async () => {
    const { token } = await registerAndLogin()
    expect((await api().get('/api/events?from=2030-05-12&to=2030-05-10').set(bearer(token))).status).toBe(400)
    expect((await api().get('/api/events')).status).toBe(401)
  })
})

describe('GET /api/events/upcoming and /occurrences', () => {
  it('returns only future events, earliest first, with a limit; /upcoming is not mistaken for an id', async () => {
    const { token } = await registerAndLogin()
    await makeEvent(token, { title: 'Past', startAt: '2020-01-01T10:00' })
    await makeEvent(token, { title: 'Later', startAt: inDays(10) })
    await makeEvent(token, { title: 'Soon', startAt: inDays(2) })
    await makeEvent(token, { title: 'Middle', startAt: inDays(5) })

    const res = await api().get('/api/events/upcoming').set(bearer(token))
    expect(res.status).toBe(200)
    expect(res.body.data.events.map((e) => e.title)).toEqual(['Soon', 'Middle', 'Later'])
    const limited = await api().get('/api/events/upcoming?limit=2').set(bearer(token))
    expect(limited.body.data.events.map((e) => e.title)).toEqual(['Soon', 'Middle'])
    expect((await api().get('/api/events/upcoming?limit=0').set(bearer(token))).status).toBe(400)
    expect((await api().get('/api/events/upcoming')).status).toBe(401)
  })

  it("never returns another user's upcoming events", async () => {
    const a = await registerAndLogin()
    const b = await registerAndLogin()
    await makeEvent(a.token, { title: 'A only', startAt: inDays(3) })
    expect((await api().get('/api/events/upcoming').set(bearer(b.token))).body.data.events).toEqual([])
  })

  it('upcoming expands recurring events into their next occurrences', async () => {
    const { token } = await registerAndLogin()
    await makeEvent(token, { title: 'Standup', startAt: inDays(-3, 9), recurrence: { frequency: 'DAILY' } })
    const res = (await api().get('/api/events/upcoming?limit=3').set(bearer(token))).body.data.events
    expect(res).toHaveLength(3)
    expect(res.every((e) => e.title === 'Standup' && e.isOccurrence && e.localTime === '09:00')).toBe(true)
    const times = res.map((e) => e.startAt)
    expect(new Set(times).size).toBe(3)
    expect([...times].sort()).toEqual(times)
    expect(times.every((t) => new Date(t) > new Date())).toBe(true)
  })

  it('occurrences: expands a weekly series for a range, respects the end date and has no duplicates', async () => {
    const { token } = await registerAndLogin()
    // 2030-05-06 is a Monday
    await makeEvent(token, { title: 'Class', startAt: '2030-05-06T10:00', recurrence: { frequency: 'WEEKLY', daysOfWeek: [1, 3], endsOn: '2030-05-15' } })
    await makeEvent(token, { title: 'One-off', startAt: '2030-05-08T15:00' })

    const res = await api().get(`/api/events/occurrences?from=2030-05-01&to=2030-05-31&timezone=${TZ}`).set(bearer(token))
    expect(res.status).toBe(200)
    const rows = res.body.data.events.map((e) => `${e.localDate} ${e.localTime} ${e.title}`)
    expect(rows).toEqual([
      '2030-05-06 10:00 Class',
      '2030-05-08 10:00 Class',
      '2030-05-08 15:00 One-off',
      '2030-05-13 10:00 Class',
      '2030-05-15 10:00 Class', // end date is inclusive; nothing after it
    ])
    expect(new Set(res.body.data.events.map((e) => `${e.id}|${e.startAt}`)).size).toBe(5)
  })

  it('occurrences: validates the range and the category filter', async () => {
    const { token } = await registerAndLogin()
    expect((await api().get('/api/events/occurrences').set(bearer(token))).status).toBe(400)
    expect((await api().get('/api/events/occurrences?from=2030-01-01&to=2031-01-01').set(bearer(token))).status).toBe(400) // > 93 days
    expect((await api().get('/api/events/occurrences?from=2030-02-01&to=2030-01-01').set(bearer(token))).status).toBe(400)
    await makeEvent(token, { category: 'office', startAt: '2030-05-10T10:00' })
    await makeEvent(token, { category: 'travel', startAt: '2030-05-10T12:00' })
    const res = await api().get('/api/events/occurrences?from=2030-05-10&to=2030-05-10&category=travel').set(bearer(token))
    expect(res.body.data.events.map((e) => e.category)).toEqual(['travel'])
  })
})

describe('GET /api/events/:id', () => {
  it('returns the owner event (200)', async () => {
    const { token } = await registerAndLogin()
    const event = await makeEvent(token)
    const res = await api().get(`/api/events/${event.id}`).set(bearer(token))
    expect(res.status).toBe(200)
    expect(res.body.data.event.id).toBe(event.id)
  })

  it("returns 404 (not the event) for another user's event or an unknown id", async () => {
    const a = await registerAndLogin()
    const b = await registerAndLogin()
    const event = await makeEvent(a.token)
    const other = await api().get(`/api/events/${event.id}`).set(bearer(b.token))
    expect(other.status).toBe(404)
    expect(JSON.stringify(other.body)).not.toContain(event.title)
    expect((await api().get('/api/events/00000000-0000-4000-8000-000000000000').set(bearer(a.token))).status).toBe(404)
  })

  it('rejects a malformed id (400) and unauthenticated access (401)', async () => {
    const { token } = await registerAndLogin()
    expect((await api().get('/api/events/not-a-uuid').set(bearer(token))).status).toBe(400)
    expect((await api().get('/api/events/1%27%20OR%20%271%27=%271').set(bearer(token))).status).toBe(400)
    expect((await api().get('/api/events/00000000-0000-4000-8000-000000000000')).status).toBe(401)
  })
})

describe('PATCH /api/events/:id', () => {
  it('updates provided fields only and preserves everything else', async () => {
    const { token } = await registerAndLogin()
    const event = await makeEvent(token)
    const res = await api().patch(`/api/events/${event.id}`).set(bearer(token)).send({ title: '  Renamed ', preparationMinutes: 45 })
    expect(res.status).toBe(200)
    expect(res.body.data.event).toMatchObject({
      title: 'Renamed',
      preparationMinutes: 45,
      category: 'university',
      startAt: event.startAt,
      timezone: TZ,
      destination: 'Engineering Building',
      notes: 'Bring the lab sheet',
      travelDurationMinutes: 35,
      arrivalBufferMinutes: 10,
    })
    expect(new Date(res.body.data.event.updatedAt) >= new Date(event.updatedAt)).toBe(true)
  })

  it('can clear optional fields and change the start time', async () => {
    const { token } = await registerAndLogin()
    const event = await makeEvent(token)
    const res = await api().patch(`/api/events/${event.id}`).set(bearer(token)).send({ destination: null, notes: '', startAt: '2030-05-11T08:15' })
    expect(res.body.data.event).toMatchObject({ destination: null, notes: null, localDate: '2030-05-11', localTime: '08:15', startAt: '2030-05-11T02:15:00.000Z' })
  })

  it('keeps the local wall time when only the timezone changes', async () => {
    const { token } = await registerAndLogin()
    const event = await makeEvent(token) // 10:00 Dhaka
    const res = await api().patch(`/api/events/${event.id}`).set(bearer(token)).send({ timezone: 'America/New_York' })
    expect(res.body.data.event).toMatchObject({ timezone: 'America/New_York', localTime: '10:00', startAt: '2030-05-10T14:00:00.000Z' })
  })

  it('adds, replaces and removes a recurrence rule (no orphan rules)', async () => {
    const a = await registerAndLogin()
    const event = await makeEvent(a.token, { startAt: '2030-05-10T09:00' }) // Friday
    const patch = (body) => api().patch(`/api/events/${event.id}`).set(bearer(a.token)).send(body)

    const added = await patch({ recurrence: { frequency: 'DAILY', interval: 2 } })
    expect(added.body.data.event).toMatchObject({ isRecurring: true, recurrence: { frequency: 'DAILY', interval: 2 } })
    const rulesFor = () => prisma.recurrenceRule.count({ where: { userId: a.user.id } })
    expect(await rulesFor()).toBe(1)

    const replaced = await patch({ recurrence: { frequency: 'WEEKLY', daysOfWeek: [5], endsOn: '2030-12-31' } })
    expect(replaced.body.data.event.recurrence).toMatchObject({ frequency: 'WEEKLY', daysOfWeek: [5], endsOn: '2030-12-31' })
    expect(await rulesFor()).toBe(1)

    const removed = await patch({ recurrence: null })
    expect(removed.body.data.event).toMatchObject({ isRecurring: false, recurrence: null })
    expect(await rulesFor()).toBe(0)
  })

  it('re-validates an existing rule when the start moves to a non-selected weekday (400, unchanged)', async () => {
    const { token } = await registerAndLogin()
    const event = await makeEvent(token, { startAt: '2030-05-10T09:00', recurrence: { frequency: 'WEEKLY', daysOfWeek: [5] } })
    const res = await api().patch(`/api/events/${event.id}`).set(bearer(token)).send({ startAt: '2030-05-11T09:00' }) // Saturday
    expect(res.status).toBe(400)
    expect((await api().get(`/api/events/${event.id}`).set(bearer(token))).body.data.event.localDate).toBe('2030-05-10')
  })

  it.each([
    ['empty body', {}],
    ['blank title', { title: '' }],
    ['bad category', { category: 'x' }],
    ['bad date', { startAt: '2030-02-31T10:00' }],
    ['bad timezone', { timezone: 'Nowhere/City' }],
    ['negative travel', { travelDurationMinutes: -1 }],
    ['bad recurrence', { recurrence: { frequency: 'MONTHLY' } }],
    ['end before start', { recurrence: { frequency: 'DAILY', endsOn: '2020-01-01' } }],
    ['userId (owner change)', { userId: '00000000-0000-4000-8000-000000000000' }],
    ['id', { id: '00000000-0000-4000-8000-000000000000' }],
  ])('rejects invalid update: %s (400) and changes nothing', async (_name, body) => {
    const { token } = await registerAndLogin()
    const event = await makeEvent(token)
    expect((await api().patch(`/api/events/${event.id}`).set(bearer(token)).send(body)).status).toBe(400)
    const after = (await api().get(`/api/events/${event.id}`).set(bearer(token))).body.data.event
    expect(after).toMatchObject({ title: event.title, startAt: event.startAt, timezone: event.timezone })
  })

  it("cannot update another user's event (404) and leaves it untouched", async () => {
    const a = await registerAndLogin()
    const b = await registerAndLogin()
    const event = await makeEvent(b.token, { title: 'B secret' })
    const res = await api().patch(`/api/events/${event.id}`).set(bearer(a.token)).send({ title: 'Hacked' })
    expect(res.status).toBe(404)
    const row = await prisma.event.findUnique({ where: { id: event.id } })
    expect(row).toMatchObject({ title: 'B secret', userId: b.user.id })
  })

  it('requires authentication (401)', async () => {
    expect((await api().patch('/api/events/00000000-0000-4000-8000-000000000000').send({ title: 'x' })).status).toBe(401)
  })
})

describe('DELETE /api/events/:id', () => {
  it('deletes the owner event (200) and then it is gone (404)', async () => {
    const { token } = await registerAndLogin()
    const event = await makeEvent(token)
    const res = await api().delete(`/api/events/${event.id}`).set(bearer(token))
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect((await api().get(`/api/events/${event.id}`).set(bearer(token))).status).toBe(404)
    expect((await api().delete(`/api/events/${event.id}`).set(bearer(token))).status).toBe(404)
  })

  it("cannot delete another user's event (404) and the event survives", async () => {
    const a = await registerAndLogin()
    const b = await registerAndLogin()
    const event = await makeEvent(b.token)
    expect((await api().delete(`/api/events/${event.id}`).set(bearer(a.token))).status).toBe(404)
    expect(await prisma.event.count({ where: { id: event.id } })).toBe(1)
  })

  it('removes the recurrence rule together with its event, and nothing else', async () => {
    const { token, user } = await registerAndLogin()
    const recurring = await makeEvent(token, { startAt: '2030-05-10T09:00', recurrence: { frequency: 'DAILY' } })
    const keep = await makeEvent(token, { startAt: '2030-05-10T09:00', title: 'Keep', recurrence: { frequency: 'DAILY' } })
    expect(await prisma.recurrenceRule.count({ where: { userId: user.id } })).toBe(2)
    await api().delete(`/api/events/${recurring.id}`).set(bearer(token))
    expect(await prisma.recurrenceRule.count({ where: { userId: user.id } })).toBe(1)
    expect((await api().get(`/api/events/${keep.id}`).set(bearer(token))).body.data.event.isRecurring).toBe(true)
  })

  it('deleting a user cascades to their events and rules (no orphans)', async () => {
    const { token, user } = await registerAndLogin()
    await makeEvent(token, { startAt: '2030-05-10T09:00', recurrence: { frequency: 'DAILY' } })
    await prisma.user.delete({ where: { id: user.id } })
    expect(await prisma.event.count({ where: { userId: user.id } })).toBe(0)
    expect(await prisma.recurrenceRule.count({ where: { userId: user.id } })).toBe(0)
  })

  it('rejects a malformed id (400) and unauthenticated access (401)', async () => {
    const { token } = await registerAndLogin()
    expect((await api().delete('/api/events/nope').set(bearer(token))).status).toBe(400)
    expect((await api().delete('/api/events/00000000-0000-4000-8000-000000000000')).status).toBe(401)
  })
})

describe('user isolation (two users, end to end)', () => {
  it('A and B each see only their own event and cannot touch the other', async () => {
    const a = await registerAndLogin({ name: 'User A' })
    const b = await registerAndLogin({ name: 'User B' })
    const eventA = await makeEvent(a.token, { title: 'Event A', startAt: inDays(2) })
    const eventB = await makeEvent(b.token, { title: 'Event B', startAt: inDays(3) })

    const titles = async (token, path) => (await api().get(path).set(bearer(token))).body.data.events.map((e) => e.title)
    expect(await titles(a.token, '/api/events')).toEqual(['Event A'])
    expect(await titles(b.token, '/api/events')).toEqual(['Event B'])
    expect(await titles(a.token, '/api/events/upcoming')).toEqual(['Event A'])
    expect(await titles(b.token, '/api/events/upcoming')).toEqual(['Event B'])
    const range = `from=${inDays(0).slice(0, 10)}&to=${inDays(10).slice(0, 10)}&timezone=${TZ}`
    expect(await titles(a.token, `/api/events/occurrences?${range}`)).toEqual(['Event A'])

    // B cannot read, update or delete A's event; A cannot do any of it to B's.
    for (const [attacker, victim] of [[b, eventA], [a, eventB]]) {
      expect((await api().get(`/api/events/${victim.id}`).set(bearer(attacker.token))).status).toBe(404)
      expect((await api().patch(`/api/events/${victim.id}`).set(bearer(attacker.token)).send({ title: 'x' })).status).toBe(404)
      expect((await api().delete(`/api/events/${victim.id}`).set(bearer(attacker.token))).status).toBe(404)
    }
    expect(await prisma.event.count({ where: { id: { in: [eventA.id, eventB.id] } } })).toBe(2)
  })

  it('a logged-out (revoked) token can no longer reach any event endpoint', async () => {
    const { token } = await registerAndLogin()
    await api().post('/api/auth/logout').set(bearer(token))
    expect((await api().get('/api/events').set(bearer(token))).status).toBe(401)
    expect((await api().post('/api/events').set(bearer(token)).send(baseEvent())).status).toBe(401)
  })
})
