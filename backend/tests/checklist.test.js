import { describe, expect, it } from 'vitest'
import { prisma } from '../src/config/database.js'
import { api, bearer, registerAndLogin } from './helpers.js'

const baseEvent = (overrides = {}) => ({
  title: 'Database Systems Class',
  category: 'university',
  startAt: '2030-05-10T10:00',
  timezone: 'Asia/Dhaka',
  destination: 'Dhaka',
  travelDurationMinutes: 35,
  preparationMinutes: 30,
  arrivalBufferMinutes: 10,
  ...overrides,
})
const makeEvent = async (token, overrides) => (await api().post('/api/events').set(bearer(token)).send(baseEvent(overrides))).body.data.event
const list = (token, eventId) => api().get(`/api/events/${eventId}/checklist`).set(bearer(token))
const add = (token, eventId, body) => api().post(`/api/events/${eventId}/checklist`).set(bearer(token)).send(body)

describe('checklist templates', () => {
  it('GET /api/checklist-templates lists a template per category; custom is empty', async () => {
    const { token } = await registerAndLogin()
    const res = await api().get('/api/checklist-templates').set(bearer(token))
    expect(res.status).toBe(200)
    const byKey = Object.fromEntries(res.body.data.templates.map((t) => [t.key, t]))
    expect(Object.keys(byKey)).toEqual(['university', 'office', 'appointment', 'travel', 'personal', 'other'])
    expect(byKey.university.items.map((i) => i.text)).toContain('Laptop')
    expect(byKey.other.items).toEqual([])
  })

  it('a new event has NO checklist items until a template is applied', async () => {
    const { token } = await registerAndLogin()
    const event = await makeEvent(token)
    const res = await list(token, event.id)
    expect(res.status).toBe(200)
    expect(res.body.data.items).toEqual([])
    expect(res.body.data.progress).toEqual({ total: 0, done: 0, remaining: 0, percent: 0 })
  })

  it('apply-template uses the event category by default, and skips duplicates the second time', async () => {
    const { token } = await registerAndLogin()
    const event = await makeEvent(token, { category: 'office' })
    const first = await api().post(`/api/events/${event.id}/checklist/apply-template`).set(bearer(token)).send({})
    expect(first.status).toBe(200)
    expect(first.body.data.template).toBe('office')
    expect(first.body.data.added).toBeGreaterThan(0)
    expect(first.body.data.items.map((i) => i.text)).toContain('Office ID')
    const second = await api().post(`/api/events/${event.id}/checklist/apply-template`).set(bearer(token)).send({})
    expect(second.body.data.added).toBe(0)
    expect(second.body.data.items).toHaveLength(first.body.data.items.length)
  })

  it('apply-template accepts an explicit template and rejects an unknown one; custom events add nothing', async () => {
    const { token } = await registerAndLogin()
    const event = await makeEvent(token, { category: 'other' })
    const none = await api().post(`/api/events/${event.id}/checklist/apply-template`).set(bearer(token)).send({})
    expect(none.body.data.added).toBe(0)
    const travel = await api().post(`/api/events/${event.id}/checklist/apply-template`).set(bearer(token)).send({ template: 'travel' })
    expect(travel.body.data.items.map((i) => i.text)).toContain('Tickets')
    const bad = await api().post(`/api/events/${event.id}/checklist/apply-template`).set(bearer(token)).send({ template: 'nope' })
    expect(bad.status).toBe(400)
  })
})

describe('checklist items: create, edit, complete, delete', () => {
  it('creates an item (201) with the default group, in order', async () => {
    const { token } = await registerAndLogin()
    const event = await makeEvent(token)
    const a = await add(token, event.id, { text: '  Umbrella  ' })
    expect(a.status).toBe(201)
    expect(a.body.data.item).toMatchObject({ text: 'Umbrella', group: 'Essentials', done: false, eventId: event.id })
    await add(token, event.id, { text: 'Charger', group: 'Electronics' })
    const res = await list(token, event.id)
    expect(res.body.data.items.map((i) => i.text)).toEqual(['Umbrella', 'Charger'])
    expect(res.body.data.progress.total).toBe(2)
  })

  it('validates input (empty, too long, bad group, unknown field)', async () => {
    const { token } = await registerAndLogin()
    const event = await makeEvent(token)
    expect((await add(token, event.id, { text: '   ' })).status).toBe(400)
    expect((await add(token, event.id, { text: 'x'.repeat(121) })).status).toBe(400)
    expect((await add(token, event.id, { text: 'ok', group: 'Nope' })).status).toBe(400)
    expect((await add(token, event.id, { text: 'ok', done: true })).status).toBe(400)
  })

  it('edits text and group, and refuses an empty patch', async () => {
    const { token } = await registerAndLogin()
    const event = await makeEvent(token)
    const { item } = (await add(token, event.id, { text: 'Keys' })).body.data
    const res = await api().patch(`/api/events/${event.id}/checklist/${item.id}`).set(bearer(token)).send({ text: 'House keys', group: 'Personal' })
    expect(res.status).toBe(200)
    expect(res.body.data.item).toMatchObject({ text: 'House keys', group: 'Personal' })
    expect((await api().patch(`/api/events/${event.id}/checklist/${item.id}`).set(bearer(token)).send({})).status).toBe(400)
  })

  it('marks an item complete and unmarks it; progress follows', async () => {
    const { token } = await registerAndLogin()
    const event = await makeEvent(token)
    const a = (await add(token, event.id, { text: 'A' })).body.data.item
    await add(token, event.id, { text: 'B' })
    const done = await api().patch(`/api/events/${event.id}/checklist/${a.id}/completion`).set(bearer(token)).send({ done: true })
    expect(done.status).toBe(200)
    expect(done.body.data.item.done).toBe(true)
    expect((await list(token, event.id)).body.data.progress).toEqual({ total: 2, done: 1, remaining: 1, percent: 50 })
    await api().patch(`/api/events/${event.id}/checklist/${a.id}/completion`).set(bearer(token)).send({ done: false })
    expect((await list(token, event.id)).body.data.progress.done).toBe(0)
    expect((await api().patch(`/api/events/${event.id}/checklist/${a.id}/completion`).set(bearer(token)).send({ done: 'yes' })).status).toBe(400)
  })

  it('deletes an item; deleting it again is 404', async () => {
    const { token } = await registerAndLogin()
    const event = await makeEvent(token)
    const { item } = (await add(token, event.id, { text: 'Gone' })).body.data
    expect((await api().delete(`/api/events/${event.id}/checklist/${item.id}`).set(bearer(token))).status).toBe(200)
    expect((await list(token, event.id)).body.data.items).toEqual([])
    expect((await api().delete(`/api/events/${event.id}/checklist/${item.id}`).set(bearer(token))).status).toBe(404)
  })

  it('persists in PostgreSQL and is removed with its event', async () => {
    const { token } = await registerAndLogin()
    const event = await makeEvent(token)
    await add(token, event.id, { text: 'Persisted' })
    expect(await prisma.checklistItem.count({ where: { eventId: event.id } })).toBe(1)
    await api().delete(`/api/events/${event.id}`).set(bearer(token))
    expect(await prisma.checklistItem.count({ where: { eventId: event.id } })).toBe(0)
  })

  it('caps a checklist at 100 items', async () => {
    const { token, user } = await registerAndLogin()
    const event = await makeEvent(token)
    await prisma.checklistItem.createMany({ data: Array.from({ length: 100 }, (_, n) => ({ userId: user.id, eventId: event.id, text: `Item ${n}`, position: n })) })
    expect((await add(token, event.id, { text: 'One too many' })).status).toBe(409)
  })
})

describe('checklist ownership and authentication', () => {
  it('requires a token on every route', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    expect((await api().get(`/api/events/${id}/checklist`)).status).toBe(401)
    expect((await api().post(`/api/events/${id}/checklist`).send({ text: 'x' })).status).toBe(401)
    expect((await api().patch(`/api/events/${id}/checklist/${id}`).send({ done: true })).status).toBe(401)
    expect((await api().delete(`/api/events/${id}/checklist/${id}`)).status).toBe(401)
    expect((await api().get('/api/checklist-templates')).status).toBe(401)
    expect((await api().get(`/api/events/${id}/weather`)).status).toBe(401)
  })

  it("another user cannot read, add to, edit, complete, delete or template someone else's checklist (404, nothing changes)", async () => {
    const owner = await registerAndLogin()
    const intruder = await registerAndLogin()
    const event = await makeEvent(owner.token)
    const { item } = (await add(owner.token, event.id, { text: 'Private' })).body.data

    expect((await list(intruder.token, event.id)).status).toBe(404)
    expect((await add(intruder.token, event.id, { text: 'Injected' })).status).toBe(404)
    expect((await api().post(`/api/events/${event.id}/checklist/apply-template`).set(bearer(intruder.token)).send({})).status).toBe(404)
    expect((await api().patch(`/api/events/${event.id}/checklist/${item.id}`).set(bearer(intruder.token)).send({ text: 'Hacked' })).status).toBe(404)
    expect((await api().patch(`/api/events/${event.id}/checklist/${item.id}/completion`).set(bearer(intruder.token)).send({ done: true })).status).toBe(404)
    expect((await api().delete(`/api/events/${event.id}/checklist/${item.id}`).set(bearer(intruder.token))).status).toBe(404)

    const after = (await list(owner.token, event.id)).body.data.items
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ text: 'Private', done: false })
  })

  it("an item id cannot be used through a different event of the same user", async () => {
    const { token } = await registerAndLogin()
    const a = await makeEvent(token)
    const b = await makeEvent(token, { title: 'Other' })
    const { item } = (await add(token, a.id, { text: 'Only in A' })).body.data
    expect((await api().delete(`/api/events/${b.id}/checklist/${item.id}`).set(bearer(token))).status).toBe(404)
    expect((await list(token, a.id)).body.data.items).toHaveLength(1)
  })

  it('rejects malformed ids with 400', async () => {
    const { token } = await registerAndLogin()
    expect((await list(token, 'not-a-uuid')).status).toBe(400)
  })
})
