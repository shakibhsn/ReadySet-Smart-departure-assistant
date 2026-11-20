import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import { prisma } from '../src/config/database.js'
import { runNotificationSweep } from '../src/services/notification/notificationSweep.service.js'
import { api, bearer, registerAndLogin } from './helpers.js'

const TZ = 'Asia/Dhaka'
const base = (over = {}) => ({ title: 'Class', category: 'university', startAt: '2030-05-06T10:00', timezone: TZ, destination: 'Hall A', travelDurationMinutes: 35, preparationMinutes: 30, arrivalBufferMinutes: 10, ...over })
const make = async (token, over) => (await api().post('/api/events').set(bearer(token)).send(base(over))).body.data.event
const daily = (over = {}) => ({ frequency: 'DAILY', interval: 1, ...over })
const occ = (token, from, to) => api().get(`/api/events/occurrences?from=${from}&to=${to}&timezone=${TZ}`).set(bearer(token))
const at = (hhmm, day = '2030-05-08') => `${day}T${hhmm}:00Z`

describe('recurrence: monthly, count, duration', () => {
  it('creates a monthly series that keeps the day of the month and reports its rule', async () => {
    const { token } = await registerAndLogin()
    const ev = await make(token, { startAt: '2030-01-31T10:00', recurrence: { frequency: 'MONTHLY', interval: 1 } })
    expect(ev.recurrence).toMatchObject({ frequency: 'MONTHLY', interval: 1, count: null })
    const list = (await occ(token, '2030-01-01', '2030-03-31')).body.data.events
    expect(list.map((e) => e.localDate)).toEqual(['2030-01-31', '2030-02-28', '2030-03-31']) // day 31 clamps to the last day
  })

  it('ends after N occurrences (the Nth occurrence is the last)', async () => {
    const { token } = await registerAndLogin()
    const ev = await make(token, { recurrence: { frequency: 'DAILY', interval: 1, count: 3 } })
    expect(ev.recurrence).toMatchObject({ count: 3, endsOn: null })
    const list = (await occ(token, '2030-05-01', '2030-05-31')).body.data.events
    expect(list.map((e) => e.localDate)).toEqual(['2030-05-06', '2030-05-07', '2030-05-08'])
  })

  it('rejects both an end date and a count, a count that is too large, and daysOfWeek for monthly', async () => {
    const { token } = await registerAndLogin()
    const post = (recurrence) => api().post('/api/events').set(bearer(token)).send(base({ recurrence }))
    expect((await post(daily({ count: 3, endsOn: '2030-06-01' }))).status).toBe(400)
    expect((await post(daily({ count: 366 }))).status).toBe(400)
    expect((await post({ frequency: 'MONTHLY', interval: 1, daysOfWeek: [1] })).status).toBe(400)
    expect((await post({ frequency: 'YEARLY', interval: 1 })).status).toBe(400)
  })

  it('moving the start of a count-limited series keeps the same number of occurrences', async () => {
    const { token } = await registerAndLogin()
    const ev = await make(token, { recurrence: daily({ count: 3 }) })
    await api().patch(`/api/events/${ev.id}`).set(bearer(token)).send({ startAt: '2030-05-20T10:00' })
    const list = (await occ(token, '2030-05-01', '2030-06-30')).body.data.events
    expect(list.map((e) => e.localDate)).toEqual(['2030-05-20', '2030-05-21', '2030-05-22'])
  })

  it('stores an optional duration and returns it; invalid durations are rejected', async () => {
    const { token } = await registerAndLogin()
    const ev = await make(token, { durationMinutes: 90 })
    expect(ev.durationMinutes).toBe(90)
    expect((await make(token)).durationMinutes).toBeNull()
    expect((await api().post('/api/events').set(bearer(token)).send(base({ durationMinutes: 0 }))).status).toBe(400)
    const patched = await api().patch(`/api/events/${ev.id}`).set(bearer(token)).send({ durationMinutes: null })
    expect(patched.body.data.event.durationMinutes).toBeNull()
  })

  it('editing the whole series never duplicates it', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token, { recurrence: daily() })
    await api().patch(`/api/events/${ev.id}`).set(bearer(token)).send({ title: 'Renamed', preparationMinutes: 45 })
    await api().patch(`/api/events/${ev.id}`).set(bearer(token)).send({ title: 'Renamed', preparationMinutes: 45 })
    expect(await prisma.event.count({ where: { userId: user.id } })).toBe(1)
    expect(await prisma.recurrenceRule.count({ where: { userId: user.id } })).toBe(1)
  })
})

describe('skip, edit and restore one occurrence', () => {
  const skip = (token, id, originalStart) => api().post(`/api/events/${id}/occurrences/skip`).set(bearer(token)).send({ originalStart })
  const override = (token, id, body) => api().patch(`/api/events/${id}/occurrences`).set(bearer(token)).send(body)
  const restore = (token, id, originalStart) => api().post(`/api/events/${id}/occurrences/restore`).set(bearer(token)).send({ originalStart })
  const plan = (token, id, qs = '') => api().get(`/api/events/${id}/departure-plan${qs}`).set(bearer(token))

  it('skipping removes only that occurrence from lists and plans; repeating the request creates no second row', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token, { recurrence: daily() })
    const target = '2030-05-08T04:00:00.000Z' // 10:00 Dhaka
    expect((await skip(token, ev.id, target)).status).toBe(200)
    expect((await skip(token, ev.id, target)).status).toBe(200)
    expect(await prisma.eventException.count({ where: { eventId: ev.id } })).toBe(1)

    const days = (await occ(token, '2030-05-06', '2030-05-10')).body.data.events.map((e) => e.localDate)
    expect(days).toEqual(['2030-05-06', '2030-05-07', '2030-05-09', '2030-05-10'])
    expect((await plan(token, ev.id, `?occurrence=${encodeURIComponent(target)}`)).status).toBe(400) // a skipped occurrence has no plan
    expect((await plan(token, ev.id, `?occurrence=${encodeURIComponent('2030-05-09T04:00:00.000Z')}`)).status).toBe(200)
    expect(await prisma.event.count({ where: { userId: user.id } })).toBe(1) // the series is never copied
  })

  it('the default plan skips over a skipped occurrence to the next real one', async () => {
    const { token } = await registerAndLogin()
    const start = DateTime.now().setZone(TZ).plus({ days: 1 }).set({ hour: 10, minute: 0, second: 0, millisecond: 0 })
    const ev = await make(token, { startAt: start.toFormat("yyyy-MM-dd'T'HH:mm"), recurrence: daily() })
    await skip(token, ev.id, start.toUTC().toISO())
    const p = (await plan(token, ev.id)).body.data
    expect(p.event.startAt).toBe(start.plus({ days: 1 }).toUTC().toISO())
  })

  it('editing one occurrence moves it and changes its own plan, leaving the series untouched', async () => {
    const { token } = await registerAndLogin()
    const ev = await make(token, { recurrence: daily() })
    const res = await override(token, ev.id, { originalStart: '2030-05-08T04:00:00.000Z', startAt: '2030-05-08T11:30', travelDurationMinutes: 90, title: 'Class (moved)' })
    expect(res.status).toBe(200)
    expect(res.body.data.occurrence).toMatchObject({ title: 'Class (moved)', localTime: '11:30', isModified: true, originalStart: '2030-05-08T04:00:00.000Z', travelDurationMinutes: 90 })

    const list = (await occ(token, '2030-05-07', '2030-05-09')).body.data.events
    expect(list.map((e) => `${e.localDate} ${e.localTime}`)).toEqual(['2030-05-07 10:00', '2030-05-08 11:30', '2030-05-09 10:00'])
    expect(list[0].travelDurationMinutes).toBe(35)
    const p = (await plan(token, ev.id, `?occurrence=${encodeURIComponent('2030-05-08T04:00:00.000Z')}`)).body.data // by original start
    expect(p.durations.travelDurationMinutes).toBe(90)
    expect(p.plan.eventStart).toBe('2030-05-08T05:30:00.000Z')
    expect(p.event).toMatchObject({ originalStart: '2030-05-08T04:00:00.000Z', isModified: true }) // identity for later skip/restore
    expect((await plan(token, ev.id, `?occurrence=${encodeURIComponent('2030-05-08T05:30:00.000Z')}`)).status).toBe(200) // by moved start
  })

  it('restore brings the original occurrence back (and is harmless when nothing was changed)', async () => {
    const { token } = await registerAndLogin()
    const ev = await make(token, { recurrence: daily() })
    const target = '2030-05-08T04:00:00.000Z'
    await skip(token, ev.id, target)
    expect((await restore(token, ev.id, target)).body.data.restored).toBe(true)
    expect((await restore(token, ev.id, target)).body.data.restored).toBe(false)
    expect((await occ(token, '2030-05-08', '2030-05-08')).body.data.events).toHaveLength(1)
  })

  it('validates: not an occurrence, move too far, nothing to change, non-recurring event, bad body', async () => {
    const { token } = await registerAndLogin()
    const ev = await make(token, { recurrence: daily() })
    const single = await make(token, { startAt: '2030-06-01T10:00' })
    expect((await skip(token, ev.id, '2030-05-08T05:00:00.000Z')).status).toBe(400) // not a generated start
    expect((await override(token, ev.id, { originalStart: '2030-05-08T04:00:00.000Z', startAt: '2030-05-20T10:00' })).status).toBe(400) // > 7 days
    expect((await override(token, ev.id, { originalStart: '2030-05-08T04:00:00.000Z' })).status).toBe(400) // nothing changed
    expect((await skip(token, single.id, '2030-06-01T04:00:00.000Z')).status).toBe(400)
    expect((await skip(token, ev.id, 'yesterday')).status).toBe(400)
    expect((await api().post(`/api/events/${ev.id}/occurrences/skip`).set(bearer(token)).send({ originalStart: '2030-05-08T04:00:00.000Z', userId: 'x' })).status).toBe(400)
  })

  it('ownership and authentication: nobody else can skip, edit, restore or list another user’s occurrences', async () => {
    const owner = await registerAndLogin()
    const intruder = await registerAndLogin()
    const ev = await make(owner.token, { recurrence: daily() })
    const target = '2030-05-08T04:00:00.000Z'
    expect((await skip(intruder.token, ev.id, target)).status).toBe(404)
    expect((await override(intruder.token, ev.id, { originalStart: target, title: 'x' })).status).toBe(404)
    expect((await restore(intruder.token, ev.id, target)).status).toBe(404)
    expect((await api().get(`/api/events/${ev.id}/exceptions`).set(bearer(intruder.token))).status).toBe(404)
    expect(await prisma.eventException.count({ where: { eventId: ev.id } })).toBe(0)
    expect((await api().post(`/api/events/${ev.id}/occurrences/skip`).send({ originalStart: target })).status).toBe(401)
  })

  it('lists the changes of a series and caps them at 200 per series', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token, { recurrence: daily() })
    await skip(token, ev.id, '2030-05-08T04:00:00.000Z')
    const list = (await api().get(`/api/events/${ev.id}/exceptions`).set(bearer(token))).body.data.exceptions
    expect(list).toEqual([expect.objectContaining({ kind: 'SKIPPED', originalStart: '2030-05-08T04:00:00.000Z' })])
    const rows = Array.from({ length: 199 }, (_, n) => ({ userId: user.id, eventId: ev.id, originalStart: new Date(Date.UTC(2031, 0, 1 + n)), kind: 'SKIPPED' }))
    await prisma.eventException.createMany({ data: rows })
    expect((await skip(token, ev.id, '2030-05-09T04:00:00.000Z')).status).toBe(409)
  })

  it('deleting the event removes its exceptions', async () => {
    const { token } = await registerAndLogin()
    const ev = await make(token, { recurrence: daily() })
    await skip(token, ev.id, '2030-05-08T04:00:00.000Z')
    await api().delete(`/api/events/${ev.id}`).set(bearer(token))
    expect(await prisma.eventException.count({ where: { eventId: ev.id } })).toBe(0)
  })
})

describe('notifications follow skipped and edited occurrences', () => {
  const types = async (userId) => (await prisma.notification.findMany({ where: { userId } })).map((n) => `${n.type}@${n.occurrenceStart.toISOString()}`).sort()

  it('a skipped occurrence produces no reminder, the others still do', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token, { recurrence: daily() })
    await api().post(`/api/events/${ev.id}/occurrences/skip`).set(bearer(token)).send({ originalStart: '2030-05-08T04:00:00.000Z' })
    await runNotificationSweep(new Date(at('02:45', '2030-05-08'))) // prep start of the skipped day
    expect(await types(user.id)).toEqual([])
    await runNotificationSweep(new Date(at('02:45', '2030-05-09')))
    expect(await types(user.id)).toEqual(['PREP_NOW@2030-05-09T04:00:00.000Z'])
  })

  it('an edited occurrence is reminded at its NEW time with its own durations', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token, { recurrence: daily() })
    await api().patch(`/api/events/${ev.id}/occurrences`).set(bearer(token)).send({ originalStart: '2030-05-08T04:00:00.000Z', startAt: '2030-05-08T14:00', preparationMinutes: 60 })
    await runNotificationSweep(new Date(at('02:45', '2030-05-08'))) // the old prep time: nothing
    expect(await types(user.id)).toEqual([])
    // new start 14:00 Dhaka = 08:00Z; prep 60 + travel 35 + buffer 10 => prep starts 06:15Z
    await runNotificationSweep(new Date(at('06:15', '2030-05-08')))
    expect(await types(user.id)).toEqual(['PREP_NOW@2030-05-08T08:00:00.000Z'])
  })

  it('skipping removes unread reminders already created for that occurrence', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token, { recurrence: daily() })
    await runNotificationSweep(new Date(at('02:45', '2030-05-08')))
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(1)
    await api().post(`/api/events/${ev.id}/occurrences/skip`).set(bearer(token)).send({ originalStart: '2030-05-08T04:00:00.000Z' })
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(0)
  })
})

describe('event templates', () => {
  const post = (token, body) => api().post('/api/event-templates').set(bearer(token)).send(body)
  const fields = (over = {}) => ({ name: 'Morning class', title: 'Algorithms', category: 'university', destination: 'Hall B', travelDurationMinutes: 25, preparationMinutes: 20, arrivalBufferMinutes: 5, ...over })

  it('saves a template from fields, lists only mine, updates and deletes it', async () => {
    const me = await registerAndLogin()
    const other = await registerAndLogin()
    const res = await post(me.token, fields())
    expect(res.status).toBe(201)
    const t = res.body.data.template
    expect(t).toMatchObject({ name: 'Morning class', title: 'Algorithms', travelDurationMinutes: 25, recurrence: null })
    expect(t).not.toHaveProperty('userId')
    await post(other.token, fields({ name: 'Other user template' }))
    expect((await api().get('/api/event-templates').set(bearer(me.token))).body.data.templates.map((x) => x.name)).toEqual(['Morning class'])
    const up = await api().patch(`/api/event-templates/${t.id}`).set(bearer(me.token)).send({ preparationMinutes: 40 })
    expect(up.body.data.template.preparationMinutes).toBe(40)
    expect((await api().delete(`/api/event-templates/${t.id}`).set(bearer(me.token))).status).toBe(200)
    expect((await api().delete(`/api/event-templates/${t.id}`).set(bearer(me.token))).status).toBe(404)
  })

  it('saves an existing event (its repeat pattern included, without any end date) as a template', async () => {
    const { token } = await registerAndLogin()
    const ev = await make(token, { recurrence: { frequency: 'WEEKLY', interval: 1, daysOfWeek: [1], endsOn: '2030-12-31' }, durationMinutes: 75 })
    const res = await post(token, { name: 'Weekly class', fromEventId: ev.id })
    expect(res.status).toBe(201)
    expect(res.body.data.template).toMatchObject({ title: 'Class', durationMinutes: 75, recurrence: { frequency: 'WEEKLY', interval: 1, daysOfWeek: [1] } })
    expect(res.body.data.template.recurrence).not.toHaveProperty('endsOn')
  })

  it('duplicate names are refused (409), validation errors are 400, the limit is 50', async () => {
    const { token, user } = await registerAndLogin()
    expect((await post(token, fields())).status).toBe(201)
    expect((await post(token, fields())).status).toBe(409)
    expect((await post(token, fields({ name: '  ' }))).status).toBe(400)
    expect((await post(token, fields({ name: 'x', recurrence: { frequency: 'DAILY', interval: 1, endsOn: '2030-01-01' } }))).status).toBe(400)
    expect((await post(token, { name: 'ghost', fromEventId: '11111111-1111-4111-8111-111111111111' })).status).toBe(404)
    await prisma.eventTemplate.createMany({ data: Array.from({ length: 49 }, (_, n) => ({ userId: user.id, name: `bulk ${n}`, title: 't', category: 'other', travelDurationMinutes: 1, preparationMinutes: 0, arrivalBufferMinutes: 0 })) })
    expect((await post(token, fields({ name: 'one too many' }))).status).toBe(409)
  })

  it('creates a real event from a template through the normal path, and a recurring template makes a series', async () => {
    const { token } = await registerAndLogin()
    const t = (await post(token, fields({ name: 'Daily', recurrence: { frequency: 'DAILY', interval: 1, count: 2 } }))).body.data.template
    const res = await api().post(`/api/event-templates/${t.id}/create-event`).set(bearer(token)).send({ startAt: '2030-07-01T09:00', timezone: TZ })
    expect(res.status).toBe(201)
    expect(res.body.data.event).toMatchObject({ title: 'Algorithms', localDate: '2030-07-01', localTime: '09:00', travelDurationMinutes: 25, isRecurring: true })
    const list = (await occ(token, '2030-07-01', '2030-07-31')).body.data.events
    expect(list).toHaveLength(2)
    // the template itself is unchanged and reusable
    expect((await api().post(`/api/event-templates/${t.id}/create-event`).set(bearer(token)).send({ startAt: '2030-08-01T09:00' })).status).toBe(201)
  })

  it('ownership and authentication', async () => {
    const owner = await registerAndLogin()
    const intruder = await registerAndLogin()
    const t = (await post(owner.token, fields())).body.data.template
    expect((await api().patch(`/api/event-templates/${t.id}`).set(bearer(intruder.token)).send({ title: 'x' })).status).toBe(404)
    expect((await api().delete(`/api/event-templates/${t.id}`).set(bearer(intruder.token))).status).toBe(404)
    expect((await api().post(`/api/event-templates/${t.id}/create-event`).set(bearer(intruder.token)).send({ startAt: '2030-08-01T09:00' })).status).toBe(404)
    expect((await post(intruder.token, { name: 'steal', fromEventId: (await make(owner.token)).id })).status).toBe(404)
    expect((await api().get('/api/event-templates')).status).toBe(401)
  })
})

describe('GET /api/schedule/conflicts', () => {
  // Events are placed relative to "now" (the endpoint looks at the next N days).
  const slot = (daysAhead, hhmm) => DateTime.now().setZone(TZ).plus({ days: daysAhead }).set({ hour: Number(hhmm.slice(0, 2)), minute: Number(hhmm.slice(3)), second: 0, millisecond: 0 }).toFormat("yyyy-MM-dd'T'HH:mm")
  const conflicts = (token, qs = '') => api().get(`/api/schedule/conflicts${qs}`).set(bearer(token))

  it('reports an overlap with both events, an explanation and a suggestion, and changes nothing', async () => {
    const { token, user } = await registerAndLogin()
    const a = await make(token, { title: 'Lecture', startAt: slot(2, '10:00'), destination: 'Hall A', durationMinutes: 60 })
    const b = await make(token, { title: 'Meeting', startAt: slot(2, '10:30'), destination: 'Office' })
    const res = await conflicts(token)
    expect(res.status).toBe(200)
    const [c] = res.body.data.conflicts
    expect(c).toMatchObject({ type: 'OVERLAP', severity: 'high' })
    expect(c.events.map((e) => e.eventId)).toEqual([a.id, b.id])
    expect(c.message).toMatch(/"Lecture".*overlaps "Meeting"/)
    expect(c.suggestion).toMatchObject({ eventId: b.id })
    expect(c.suggestion.shiftMinutes).toBeGreaterThan(0)
    expect(res.body.data.summary).toEqual({ high: 1, medium: 0 })
    expect(res.body.data.assumptions.join(' ')).toMatch(/60 minutes/)
    expect(await prisma.event.count({ where: { userId: user.id } })).toBe(2) // nothing was changed or deleted
  })

  it('no conflicts for a relaxed schedule, and an empty one is a normal 200', async () => {
    const { token } = await registerAndLogin()
    expect((await conflicts(token)).body.data).toMatchObject({ conflicts: [], eventsChecked: 0 })
    await make(token, { startAt: slot(2, '09:00'), destination: 'A' })
    await make(token, { startAt: slot(2, '15:00'), destination: 'B' })
    expect((await conflicts(token)).body.data.conflicts).toEqual([])
  })

  it('a skipped occurrence no longer conflicts; an edited one is checked at its new time', async () => {
    const { token } = await registerAndLogin()
    const series = await make(token, { title: 'Daily', startAt: slot(1, '10:00'), destination: 'A', recurrence: daily(), durationMinutes: 60 })
    await make(token, { title: 'One-off', startAt: slot(2, '10:15'), destination: 'B' })
    expect((await conflicts(token)).body.data.conflicts.some((c) => c.type === 'OVERLAP')).toBe(true)
    const original = DateTime.fromFormat(slot(2, '10:00'), "yyyy-MM-dd'T'HH:mm", { zone: TZ }).toUTC().toISO()
    await api().post(`/api/events/${series.id}/occurrences/skip`).set(bearer(token)).send({ originalStart: original })
    expect((await conflicts(token)).body.data.conflicts.some((c) => c.type === 'OVERLAP')).toBe(false)
  })

  it('only analyses my own events', async () => {
    const mine = await registerAndLogin()
    const other = await registerAndLogin()
    await make(mine.token, { startAt: slot(2, '10:00') })
    await make(other.token, { startAt: slot(2, '10:20') })
    expect((await conflicts(mine.token)).body.data).toMatchObject({ conflicts: [], eventsChecked: 1 })
  })

  it('validates the query and requires a token', async () => {
    const { token } = await registerAndLogin()
    expect((await conflicts(token, '?days=0')).status).toBe(400)
    expect((await conflicts(token, '?days=32')).status).toBe(400)
    expect((await conflicts(token, '?from=tomorrow')).status).toBe(400)
    expect((await conflicts(token, '?days=7')).status).toBe(200)
    expect((await api().get('/api/schedule/conflicts')).status).toBe(401)
  })
})
