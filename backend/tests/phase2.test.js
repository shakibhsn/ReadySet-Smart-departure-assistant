import { describe, expect, it } from 'vitest'
import { prisma } from '../src/config/database.js'
import { api, bearer, registerAndLogin } from './helpers.js'

const base = (over = {}) => ({ title: 'Gym session', category: 'gym', startAt: '2030-05-06T18:00', timezone: 'Asia/Dhaka', destination: 'City Gym', travelDurationMinutes: 20, preparationMinutes: 15, arrivalBufferMinutes: 5, ...over })
const make = async (token, over) => (await api().post('/api/events').set(bearer(token)).send(base(over))).body.data.event
const addItem = async (token, eventId, text, group) => (await api().post(`/api/events/${eventId}/checklist`).set(bearer(token)).send({ text, group })).body.data.item

describe('saved places', () => {
  const post = (token, body) => api().post('/api/places').set(bearer(token)).send(body)
  const home = { label: 'Home', kind: 'home', address: '12 Lake Road, Dhaka' }

  it('creates, lists (only mine), updates and deletes a place', async () => {
    const me = await registerAndLogin()
    const other = await registerAndLogin()
    const res = await post(me.token, home)
    expect(res.status).toBe(201)
    const p = res.body.data.place
    expect(p).toMatchObject({ label: 'Home', kind: 'home', address: '12 Lake Road, Dhaka', isDefaultStart: false })
    expect(p).not.toHaveProperty('userId')
    await post(other.token, { label: 'Secret', kind: 'other', address: 'Somewhere private' })
    const list = (await api().get('/api/places').set(bearer(me.token))).body.data
    expect(list.places.map((x) => x.label)).toEqual(['Home'])
    expect(JSON.stringify(list)).not.toContain('Somewhere private')
    const up = await api().patch(`/api/places/${p.id}`).set(bearer(me.token)).send({ label: 'Flat', address: '99 New Road' })
    expect(up.body.data.place).toMatchObject({ label: 'Flat', address: '99 New Road' })
    expect((await api().delete(`/api/places/${p.id}`).set(bearer(me.token))).status).toBe(200)
    expect((await api().delete(`/api/places/${p.id}`).set(bearer(me.token))).status).toBe(404)
  })

  it('validates input and rejects duplicate names (409) and too many places', async () => {
    const { token, user } = await registerAndLogin()
    expect((await post(token, { label: '', address: 'x' })).status).toBe(400)
    expect((await post(token, { label: 'A', address: 'line\nbreak' })).status).toBe(400)
    expect((await post(token, { label: 'A', address: 'x', kind: 'castle' })).status).toBe(400)
    expect((await post(token, { label: 'A', address: 'x', userId: 'someone' })).status).toBe(400)
    expect((await post(token, home)).status).toBe(201)
    expect((await post(token, home)).status).toBe(409)
    await prisma.savedPlace.createMany({ data: Array.from({ length: 29 }, (_, n) => ({ userId: user.id, label: `bulk ${n}`, kind: 'other', address: 'x' })) })
    expect((await post(token, { label: 'one too many', address: 'x' })).status).toBe(409)
  })

  it('chooses, changes and clears the default starting location; deleting that place clears it', async () => {
    const { token } = await registerAndLogin()
    const a = (await post(token, home)).body.data.place
    const b = (await post(token, { label: 'Office', kind: 'office', address: '1 Business Ave' })).body.data.place
    const get = async () => (await api().get('/api/places').set(bearer(token))).body.data
    expect((await get()).defaultStartPlaceId).toBeNull()
    expect((await api().patch('/api/places/default').set(bearer(token)).send({ placeId: a.id })).body.data.defaultStartPlaceId).toBe(a.id)
    await api().patch('/api/places/default').set(bearer(token)).send({ placeId: b.id })
    const after = await get()
    expect(after.defaultStartPlaceId).toBe(b.id)
    expect(after.places.filter((p) => p.isDefaultStart).map((p) => p.label)).toEqual(['Office']) // exactly one default
    await api().delete(`/api/places/${b.id}`).set(bearer(token))
    expect((await get()).defaultStartPlaceId).toBeNull()
    await api().patch('/api/places/default').set(bearer(token)).send({ placeId: a.id })
    expect((await api().patch('/api/places/default').set(bearer(token)).send({ placeId: null })).body.data.defaultStartPlaceId).toBeNull()
  })

  it('creating a place can make it the default in one step', async () => {
    const { token } = await registerAndLogin()
    const res = await post(token, { ...home, makeDefault: true })
    expect(res.body.data.place.isDefaultStart).toBe(true)
  })

  it("ownership: nobody can read, change, delete or select another user's place; every route needs a token", async () => {
    const owner = await registerAndLogin()
    const intruder = await registerAndLogin()
    const p = (await post(owner.token, home)).body.data.place
    expect((await api().patch(`/api/places/${p.id}`).set(bearer(intruder.token)).send({ label: 'Hacked' })).status).toBe(404)
    expect((await api().delete(`/api/places/${p.id}`).set(bearer(intruder.token))).status).toBe(404)
    expect((await api().patch('/api/places/default').set(bearer(intruder.token)).send({ placeId: p.id })).status).toBe(404)
    expect(await prisma.savedPlace.findUnique({ where: { id: p.id } })).toMatchObject({ label: 'Home', userId: owner.user.id })
    expect((await api().get('/api/places')).status).toBe(401)
    expect((await api().post('/api/places').send(home)).status).toBe(401)
    expect((await api().patch('/api/places/default').send({ placeId: null })).status).toBe(401)
  })

  it('deleting the user removes their places (no orphan private data)', async () => {
    const { token, user } = await registerAndLogin()
    await post(token, home)
    await prisma.user.delete({ where: { id: user.id } })
    expect(await prisma.savedPlace.count({ where: { userId: user.id } })).toBe(0)
  })

  it('a saved place feeds event creation through the existing destination field', async () => {
    const { token } = await registerAndLogin()
    const p = (await post(token, { label: 'Campus', kind: 'university', address: 'Main Campus, Block C' })).body.data.place
    const ev = await make(token, { category: 'university', destination: p.address })
    expect(ev.destination).toBe('Main Campus, Block C')
    // The event keeps its own copy: renaming the place later does not rewrite existing events.
    await api().patch(`/api/places/${p.id}`).set(bearer(token)).send({ address: 'New Campus' })
    expect((await api().get(`/api/events/${ev.id}`).set(bearer(token))).body.data.event.destination).toBe('Main Campus, Block C')
  })
})

describe('event categories and packing suggestions', () => {
  it.each(['interview', 'business', 'gym'])('events accept the %s category', async (category) => {
    const { token } = await registerAndLogin()
    expect((await api().post('/api/events').set(bearer(token)).send(base({ category }))).status).toBe(201)
  })

  it('applies the matching built-in template for the new categories, with every item editable afterwards', async () => {
    const { token } = await registerAndLogin()
    const ev = await make(token, { category: 'interview' })
    const res = await api().post(`/api/events/${ev.id}/checklist/apply-template`).set(bearer(token)).send({})
    expect(res.body.data.template).toBe('interview')
    expect(res.body.data.items.map((i) => i.text)).toContain('Printed CVs')
    const first = res.body.data.items[0]
    expect((await api().patch(`/api/events/${ev.id}/checklist/${first.id}`).set(bearer(token)).send({ text: 'Two printed CVs' })).body.data.item.text).toBe('Two printed CVs')
    expect((await api().delete(`/api/events/${ev.id}/checklist/${first.id}`).set(bearer(token))).status).toBe(200)
  })

  it('GET /api/packing/suggestions returns the category template; unknown categories are 400', async () => {
    const { token } = await registerAndLogin()
    const res = await api().get('/api/packing/suggestions?category=gym').set(bearer(token))
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ category: 'gym', label: 'Gym', oftenForgotten: [] })
    expect(res.body.data.items.map((i) => i.text)).toContain('Towel')
    expect((await api().get('/api/packing/suggestions?category=nope').set(bearer(token))).status).toBe(400)
    expect((await api().get('/api/packing/suggestions?category=gym')).status).toBe(401)
  })
})

describe('personal packing templates', () => {
  const post = (token, body) => api().post('/api/packing-templates').set(bearer(token)).send(body)

  it('saves a template from typed items, lists only mine, updates and deletes it', async () => {
    const me = await registerAndLogin()
    const other = await registerAndLogin()
    const res = await post(me.token, { name: 'Gym bag', items: [{ text: 'Towel', group: 'Essentials' }, { text: 'towel ' }, { text: 'Protein shaker', group: 'Personal' }] })
    expect(res.status).toBe(201)
    expect(res.body.data.template.items.map((i) => i.text)).toEqual(['Towel', 'Protein shaker']) // duplicates removed
    await post(other.token, { name: 'Other', items: [{ text: 'x' }] })
    expect((await api().get('/api/packing-templates').set(bearer(me.token))).body.data.templates.map((t) => t.name)).toEqual(['Gym bag'])
    const id = res.body.data.template.id
    const up = await api().patch(`/api/packing-templates/${id}`).set(bearer(me.token)).send({ items: [{ text: 'Shoes' }] })
    expect(up.body.data.template.items).toEqual([{ text: 'Shoes', group: 'Essentials' }])
    expect((await api().delete(`/api/packing-templates/${id}`).set(bearer(me.token))).status).toBe(200)
    expect((await api().delete(`/api/packing-templates/${id}`).set(bearer(me.token))).status).toBe(404)
  })

  it('saves the CURRENT checklist of an event as a template, then reuses it for a future event', async () => {
    const { token } = await registerAndLogin()
    const first = await make(token)
    await addItem(token, first.id, 'Yoga mat', 'Essentials')
    await addItem(token, first.id, 'Headphones', 'Electronics')
    const saved = await post(token, { name: 'My gym list', fromEventId: first.id })
    expect(saved.status).toBe(201)
    expect(saved.body.data.template.items.map((i) => i.text)).toEqual(['Yoga mat', 'Headphones'])

    const next = await make(token, { startAt: '2030-05-13T18:00' })
    await addItem(token, next.id, 'Headphones', 'Electronics') // already there: must be skipped
    const applied = await api().post(`/api/events/${next.id}/checklist/apply-template`).set(bearer(token)).send({ personalTemplateId: saved.body.data.template.id })
    expect(applied.status).toBe(200)
    expect(applied.body.data).toMatchObject({ added: 1, skipped: 1 })
    expect(applied.body.data.items.map((i) => i.text).sort()).toEqual(['Headphones', 'Yoga mat'])
    expect(applied.body.data.progress).toMatchObject({ total: 2, done: 0, remaining: 2 }) // remaining uncompleted items
  })

  it('validation, duplicates, limits and an empty checklist', async () => {
    const { token, user } = await registerAndLogin()
    const empty = await make(token)
    expect((await post(token, { name: 'x', items: [] })).status).toBe(400)
    expect((await post(token, { name: '  ', items: [{ text: 'a' }] })).status).toBe(400)
    expect((await post(token, { name: 'nothing', fromEventId: empty.id })).status).toBe(400) // no items to save
    expect((await post(token, { name: 'dup', items: [{ text: 'a' }] })).status).toBe(201)
    expect((await post(token, { name: 'dup', items: [{ text: 'a' }] })).status).toBe(409)
    await prisma.packingTemplate.createMany({ data: Array.from({ length: 29 }, (_, n) => ({ userId: user.id, name: `bulk ${n}`, items: [{ text: 'a', group: 'Essentials' }] })) })
    expect((await post(token, { name: 'one too many', items: [{ text: 'a' }] })).status).toBe(409)
  })

  it('ownership and authentication: no one can read, change, delete, copy from or apply another user’s template', async () => {
    const owner = await registerAndLogin()
    const intruder = await registerAndLogin()
    const t = (await post(owner.token, { name: 'Mine', items: [{ text: 'Secret item' }] })).body.data.template
    const ev = await make(intruder.token)
    expect((await api().patch(`/api/packing-templates/${t.id}`).set(bearer(intruder.token)).send({ name: 'Hacked' })).status).toBe(404)
    expect((await api().delete(`/api/packing-templates/${t.id}`).set(bearer(intruder.token))).status).toBe(404)
    expect((await api().post(`/api/events/${ev.id}/checklist/apply-template`).set(bearer(intruder.token)).send({ personalTemplateId: t.id })).status).toBe(404)
    expect((await post(intruder.token, { name: 'steal', fromEventId: (await make(owner.token)).id })).status).toBe(404)
    expect((await api().get('/api/packing-templates')).status).toBe(401)
  })
})

describe('frequently forgotten items (explicit reports only)', () => {
  const forgot = (token, eventId, itemId) => api().post(`/api/events/${eventId}/checklist/${itemId}/forgot`).set(bearer(token))
  const forgotten = async (token) => (await api().get('/api/packing/forgotten').set(bearer(token))).body.data.items

  it('an unchecked item is NEVER counted as forgotten, however long it stays unchecked', async () => {
    const { token } = await registerAndLogin()
    const ev = await make(token, { startAt: '2020-01-01T10:00' }) // long in the past
    await addItem(token, ev.id, 'Charger')
    await addItem(token, ev.id, 'Charger2')
    expect(await forgotten(token)).toEqual([])
    expect((await api().get('/api/packing/suggestions?category=gym').set(bearer(token))).body.data.oftenForgotten).toEqual([])
  })

  it('a report is recorded once per item per day; repeating it changes nothing', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token)
    const item = await addItem(token, ev.id, 'Charger')
    expect((await forgot(token, ev.id, item.id)).body.data).toEqual({ reported: true, alreadyReported: false })
    expect((await forgot(token, ev.id, item.id)).body.data).toEqual({ reported: false, alreadyReported: true })
    expect(await prisma.forgottenItemReport.count({ where: { userId: user.id } })).toBe(1)
  })

  it('"frequently" needs at least 2 reports in the last 180 days; it is then offered as a suggestion only', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token)
    const item = await addItem(token, ev.id, 'Charger')
    await forgot(token, ev.id, item.id)
    expect(await forgotten(token)).toEqual([]) // one report is not a pattern
    // A second report on an earlier day (simulated directly: the API allows one per day).
    await prisma.forgottenItemReport.create({ data: { userId: user.id, eventId: ev.id, itemText: 'charger', textKey: 'charger', reportedOn: new Date(Date.now() - 3 * 86_400_000) } })
    const list = await forgotten(token)
    expect(list).toEqual([expect.objectContaining({ reports: 2 })])
    expect(list[0].text.toLowerCase()).toBe('charger')
    const s = (await api().get('/api/packing/suggestions?category=travel').set(bearer(token))).body.data
    expect(s.oftenForgotten).toHaveLength(1)
    expect(s.note).toMatch(/never added automatically/)
    // Not auto-added: a new event's checklist stays empty until the user adds something.
    const next = await make(token, { startAt: '2030-05-20T18:00' })
    expect((await api().get(`/api/events/${next.id}/checklist`).set(bearer(token))).body.data.items).toEqual([])
  })

  it('reports older than 180 days no longer count', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token)
    for (const days of [200, 220]) await prisma.forgottenItemReport.create({ data: { userId: user.id, eventId: ev.id, itemText: 'Keys', textKey: 'keys', reportedOn: new Date(Date.now() - days * 86_400_000) } })
    expect(await forgotten(token)).toEqual([])
  })

  it('a mis-click can be undone (today only)', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token)
    const item = await addItem(token, ev.id, 'Charger')
    await forgot(token, ev.id, item.id)
    const res = await api().delete(`/api/events/${ev.id}/checklist/${item.id}/forgot`).set(bearer(token))
    expect(res.body.data.removed).toBe(true)
    expect(await prisma.forgottenItemReport.count({ where: { userId: user.id } })).toBe(0)
  })

  it('history survives deleting the event (the report is kept, detached from it)', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token)
    const item = await addItem(token, ev.id, 'Charger')
    await forgot(token, ev.id, item.id)
    await api().delete(`/api/events/${ev.id}`).set(bearer(token))
    const rows = await prisma.forgottenItemReport.findMany({ where: { userId: user.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].eventId).toBeNull()
  })

  it("ownership: other users' items cannot be reported, and one user's reports never show for another", async () => {
    const owner = await registerAndLogin()
    const other = await registerAndLogin()
    const ev = await make(owner.token)
    const item = await addItem(owner.token, ev.id, 'Charger')
    expect((await forgot(other.token, ev.id, item.id)).status).toBe(404)
    for (const days of [1, 2]) await prisma.forgottenItemReport.create({ data: { userId: owner.user.id, eventId: ev.id, itemText: 'Charger', textKey: 'charger', reportedOn: new Date(Date.now() - days * 86_400_000) } })
    expect(await forgotten(owner.token)).toHaveLength(1)
    expect(await forgotten(other.token)).toEqual([])
    expect((await api().post(`/api/events/${ev.id}/checklist/${item.id}/forgot`)).status).toBe(401)
    expect((await api().get('/api/packing/forgotten')).status).toBe(401)
  })
})
