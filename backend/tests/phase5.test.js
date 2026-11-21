import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import { supportsField } from '../src/config/database.js'
import { api, bearer, registerAndLogin } from './helpers.js'

const TZ = 'Asia/Dhaka'
const local = (m) => DateTime.now().setZone(TZ).plus({ minutes: m })
const inMinutes = (m) => local(m).toFormat("yyyy-MM-dd'T'HH:mm")
const make = async (token, over = {}) => (await api().post('/api/events').set(bearer(token)).send({ title: 'Office day', category: 'office', startAt: inMinutes(120), timezone: TZ, destination: 'Dhaka', travelDurationMinutes: 20, preparationMinutes: 30, arrivalBufferMinutes: 10, ...over })).body.data.event
const setTimezone = (token) => api().patch('/api/users/me/preferences').set(bearer(token)).send({ timezone: TZ })

describe('weekly planner endpoint', () => {
  it('requires a login and validates the start date', async () => {
    expect((await api().get('/api/week')).status).toBe(401)
    const { token } = await registerAndLogin()
    expect((await api().get('/api/week?start=banana').set(bearer(token))).status).toBe(400)
    expect((await api().get('/api/week?start=2030-02-31').set(bearer(token))).status).toBe(400)
  })
  it('a new user gets a full empty week (7 days, zero workload), not an error', async () => {
    const { token } = await registerAndLogin()
    const res = await api().get('/api/week').set(bearer(token))
    expect(res.status).toBe(200)
    expect(res.body.data.days).toHaveLength(7)
    expect(res.body.data.summary).toMatchObject({ events: 0, conflicts: 0, workloadMinutes: 0, busiestDay: null })
  })
  it('shows only my events, with workload, priority and a conflict flag', async () => {
    const a = await registerAndLogin()
    const b = await registerAndLogin()
    await setTimezone(a.token)
    const start = DateTime.now().setZone(TZ).startOf('week').plus({ days: 2, hours: 10 }).toFormat("yyyy-MM-dd'T'HH:mm")
    const first = await make(a.token, { title: 'Lecture', startAt: start, durationMinutes: 120, preparationMinutes: 30 })
    await make(a.token, { title: 'Meeting', startAt: DateTime.fromFormat(start, "yyyy-MM-dd'T'HH:mm").plus({ minutes: 30 }).toFormat("yyyy-MM-dd'T'HH:mm"), preparationMinutes: 15 })
    await make(b.token, { title: 'Someone elses private event', startAt: start })
    const res = (await api().get(`/api/week?start=${start.slice(0, 10)}`).set(bearer(a.token))).body.data
    const events = res.days.flatMap((d) => d.events)
    expect(events.map((e) => e.title).sort()).toEqual(['Lecture', 'Meeting'])
    expect(JSON.stringify(res)).not.toContain('private event')
    expect(events.every((e) => e.priority === 'normal' || ['low', 'high'].includes(e.priority))).toBe(true)
    expect(events.find((e) => e.id === first.id).hasConflict).toBe(true)
    expect(res.summary).toMatchObject({ events: 2, workloadMinutes: 45 })
    expect(res.summary.conflicts).toBeGreaterThan(0)
    expect(res.summary.busiestDay).toBe(start.slice(0, 10))
  })
})

describe('analytics endpoint', () => {
  it('requires a login and rejects bad ranges', async () => {
    expect((await api().get('/api/analytics')).status).toBe(401)
    const { token } = await registerAndLogin()
    for (const q of ['from=nope', 'from=2030-02-01&to=2030-01-01', 'from=2020-01-01&to=2030-01-01', 'granularity=day', 'from=2030-02-31']) {
      expect((await api().get(`/api/analytics?${q}`).set(bearer(token))).status).toBe(400)
    }
  })
  it('a new user gets honest empty metrics (no fake numbers)', async () => {
    const { token } = await registerAndLogin()
    const d = (await api().get('/api/analytics').set(bearer(token))).body.data
    expect(d.hasEvents).toBe(false)
    expect(d.totals.scheduled).toBe(0)
    expect(d.checklist.rate.status).toBe('insufficient_data')
    expect(d.checklist.totalItems).toBe(0)
  })
  it("counts only my own data, and the checklist rate is computed from real items", async () => {
    const a = await registerAndLogin()
    const b = await registerAndLogin()
    const ev = await make(a.token, { startAt: inMinutes(60) })
    await make(b.token, { startAt: inMinutes(60) })
    const items = []
    for (const text of ['Wallet', 'Keys', 'Phone', 'Charger']) items.push((await api().post(`/api/events/${ev.id}/checklist`).set(bearer(a.token)).send({ text })).body.data.item)
    for (const i of items.slice(0, 3)) await api().patch(`/api/events/${ev.id}/checklist/${i.id}/completion`).set(bearer(a.token)).send({ done: true })
    const from = local(-24 * 60).toFormat('yyyy-MM-dd')
    const to = local(48 * 60).toFormat('yyyy-MM-dd')
    await setTimezone(a.token)
    const d = (await api().get(`/api/analytics?from=${from}&to=${to}`).set(bearer(a.token))).body.data
    expect(d.totals.scheduled).toBe(1)
    expect(d.checklist).toMatchObject({ totalItems: 4, doneItems: 3, rate: { status: 'ok', percent: 75 } })
    expect(['available', 'unavailable']).toContain(d.preparationTracking)
    const other = (await api().get(`/api/analytics?from=${from}&to=${to}`).set(bearer(b.token))).body.data
    expect(other.checklist.totalItems).toBe(0)
  })
})

describe('checklist completion + offline sync conflicts', () => {
  const setup = async () => {
    const { token } = await registerAndLogin()
    const ev = await make(token)
    const item = (await api().post(`/api/events/${ev.id}/checklist`).set(bearer(token)).send({ text: 'Passport' })).body.data.item
    return { token, ev, item }
  }
  const tick = (t, ev, item, body) => api().patch(`/api/events/${ev.id}/checklist/${item.id}/completion`).set(bearer(t)).send(body)

  it('a change with an up-to-date base is applied; repeating it is idempotent', async () => {
    const { token, ev, item } = await setup()
    const first = await tick(token, ev, item, { done: true, baseUpdatedAt: item.updatedAt })
    expect(first.status).toBe(200)
    const again = await tick(token, ev, item, { done: true, baseUpdatedAt: item.updatedAt })
    expect(again.status).toBe(200)
    expect(again.body.data.item.done).toBe(true)
  })
  it('an offline edit made on an older copy is refused when the server state differs and changed since', async () => {
    const { token, ev, item } = await setup()
    await new Promise((r) => setTimeout(r, 15))
    await tick(token, ev, item, { done: true }) // changed elsewhere
    await new Promise((r) => setTimeout(r, 15))
    await tick(token, ev, item, { done: false }) // and back, still newer than the offline copy
    const stale = await tick(token, ev, item, { done: true, baseUpdatedAt: item.updatedAt })
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('SYNC_CONFLICT')
  })
  it("cannot sync into another user's checklist, and a bad base is rejected", async () => {
    const a = await setup()
    const b = await registerAndLogin()
    expect((await tick(b.token, a.ev, a.item, { done: true, baseUpdatedAt: a.item.updatedAt })).status).toBe(404)
    expect((await tick(a.token, a.ev, a.item, { done: true, baseUpdatedAt: 'yesterday' })).status).toBe(400)
    expect((await tick(a.token, a.ev, a.item, { done: true, extra: 1 })).status).toBe(400)
  })
  it.skipIf(!supportsField('ChecklistItem', 'completedAt'))('records when an item was ticked and clears it when unticked', async () => {
    const { token, ev, item } = await setup()
    const ticked = (await tick(token, ev, item, { done: true })).body.data.item
    expect(ticked.completedAt).toBeTruthy()
    const again = (await tick(token, ev, item, { done: true })).body.data.item
    expect(again.completedAt).toBe(ticked.completedAt) // the first completion time is kept
    expect((await tick(token, ev, item, { done: false })).body.data.item.completedAt).toBeNull()
  })
})

describe('event priority', () => {
  it('rejects unknown values', async () => {
    const { token } = await registerAndLogin()
    const res = await api().post('/api/events').set(bearer(token)).send({ title: 'x', category: 'office', startAt: inMinutes(120), timezone: TZ, travelDurationMinutes: 10, preparationMinutes: 10, arrivalBufferMinutes: 5, priority: 'urgent' })
    expect(res.status).toBe(400)
  })
  it('without the migrated column, a non-default priority is a clear 503 and the default still works', async () => {
    if (supportsField('Event', 'priority')) return
    const { token } = await registerAndLogin()
    const body = { title: 'x', category: 'office', startAt: inMinutes(120), timezone: TZ, travelDurationMinutes: 10, preparationMinutes: 10, arrivalBufferMinutes: 5 }
    expect((await api().post('/api/events').set(bearer(token)).send({ ...body, priority: 'high' })).status).toBe(503)
    const ok = await api().post('/api/events').set(bearer(token)).send({ ...body, priority: 'normal' })
    expect(ok.status).toBe(201)
    expect(ok.body.data.event.priority).toBe('normal')
  })
  it.skipIf(!supportsField('Event', 'priority'))('can be set on create and changed on update', async () => {
    const { token } = await registerAndLogin()
    const ev = await make(token, { priority: 'high' })
    expect(ev.priority).toBe('high')
    const up = await api().patch(`/api/events/${ev.id}`).set(bearer(token)).send({ priority: 'low' })
    expect(up.body.data.event.priority).toBe('low')
  })
})
