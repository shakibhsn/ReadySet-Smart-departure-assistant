import { describe, expect, it } from 'vitest'
import { prisma } from '../src/config/database.js'
import { api, bearer, registerAndLogin } from './helpers.js'

let seq = 0
const seed = (userId, overrides = {}) =>
  prisma.notification.create({
    data: { userId, type: 'PREP_NOW', category: 'preparation', title: `Title ${seq}`, body: 'Body', dedupeKey: `test:${Date.now()}:${seq++}`, ...overrides },
  })
const list = (token, qs = '') => api().get(`/api/notifications${qs}`).set(bearer(token))

describe('authentication', () => {
  it('every notification route requires a token', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    for (const res of await Promise.all([
      api().get('/api/notifications'),
      api().get('/api/notifications/unread-count'),
      api().post('/api/notifications/read-all'),
      api().patch(`/api/notifications/${id}/read`),
      api().delete(`/api/notifications/${id}`),
      api().get('/api/users/me/notification-preferences'),
      api().patch('/api/users/me/notification-preferences').send({ enabled: false }),
    ])) expect(res.status).toBe(401)
  })
})

describe('GET /api/notifications', () => {
  it('lists only my notifications, newest first, with the unread count and pagination', async () => {
    const me = await registerAndLogin()
    const other = await registerAndLogin()
    const a = await seed(me.user.id, { title: 'old', createdAt: new Date('2030-01-01T00:00:00Z') })
    const b = await seed(me.user.id, { title: 'new', createdAt: new Date('2030-01-02T00:00:00Z'), readAt: new Date() })
    await seed(other.user.id, { title: 'not mine' })
    const res = await list(me.token)
    expect(res.status).toBe(200)
    expect(res.body.data.notifications.map((n) => n.title)).toEqual(['new', 'old'])
    expect(res.body.data.notifications[0]).toMatchObject({ id: b.id, read: true })
    expect(res.body.data.notifications[1]).toMatchObject({ id: a.id, read: false })
    expect(res.body.data.unreadCount).toBe(1)
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 })
    expect(JSON.stringify(res.body)).not.toContain('not mine')
    expect(res.body.data.notifications[0]).not.toHaveProperty('userId')
  })

  it('filters by status and category and paginates with a bounded limit', async () => {
    const me = await registerAndLogin()
    for (let i = 0; i < 5; i++) await seed(me.user.id, { category: i < 2 ? 'departure' : 'preparation', readAt: i === 0 ? new Date() : null })
    expect((await list(me.token, '?status=unread')).body.data.pagination.total).toBe(4)
    expect((await list(me.token, '?status=read')).body.data.pagination.total).toBe(1)
    expect((await list(me.token, '?category=departure')).body.data.pagination.total).toBe(2)
    const page = await list(me.token, '?limit=2&page=3')
    expect(page.body.data.notifications).toHaveLength(1)
    expect(page.body.data.pagination).toMatchObject({ page: 3, limit: 2, total: 5, totalPages: 3 })
    expect((await list(me.token, '?limit=51')).status).toBe(400)
    expect((await list(me.token, '?status=bogus')).status).toBe(400)
  })

  it('an empty history is a normal 200', async () => {
    const me = await registerAndLogin()
    const res = await list(me.token)
    expect(res.body.data).toMatchObject({ notifications: [], unreadCount: 0 })
  })
})

describe('unread count, mark read, mark all read, delete', () => {
  it('unread-count reflects reads', async () => {
    const me = await registerAndLogin()
    const n = await seed(me.user.id)
    await seed(me.user.id)
    expect((await api().get('/api/notifications/unread-count').set(bearer(me.token))).body.data.unreadCount).toBe(2)
    await api().patch(`/api/notifications/${n.id}/read`).set(bearer(me.token))
    expect((await api().get('/api/notifications/unread-count').set(bearer(me.token))).body.data.unreadCount).toBe(1)
  })

  it('marks one as read; doing it again is harmless and keeps the first read time', async () => {
    const me = await registerAndLogin()
    const n = await seed(me.user.id)
    const first = await api().patch(`/api/notifications/${n.id}/read`).set(bearer(me.token))
    expect(first.status).toBe(200)
    expect(first.body.data.notification.read).toBe(true)
    expect(first.body.data.unreadCount).toBe(0)
    const second = await api().patch(`/api/notifications/${n.id}/read`).set(bearer(me.token))
    expect(second.status).toBe(200)
    expect(second.body.data.notification.readAt).toBe(first.body.data.notification.readAt)
  })

  it('marks all of MY notifications read and nobody else’s', async () => {
    const me = await registerAndLogin()
    const other = await registerAndLogin()
    await seed(me.user.id)
    await seed(me.user.id)
    const theirs = await seed(other.user.id)
    const res = await api().post('/api/notifications/read-all').set(bearer(me.token))
    expect(res.body.data).toMatchObject({ updated: 2, unreadCount: 0 })
    expect((await prisma.notification.findUnique({ where: { id: theirs.id } })).readAt).toBeNull()
  })

  it('deletes my notification (then 404)', async () => {
    const me = await registerAndLogin()
    const n = await seed(me.user.id)
    expect((await api().delete(`/api/notifications/${n.id}`).set(bearer(me.token))).status).toBe(200)
    expect(await prisma.notification.count({ where: { id: n.id } })).toBe(0)
    expect((await api().delete(`/api/notifications/${n.id}`).set(bearer(me.token))).status).toBe(404)
  })

  it('another user cannot read, change or delete my notification (404, row untouched)', async () => {
    const me = await registerAndLogin()
    const other = await registerAndLogin()
    const n = await seed(me.user.id)
    expect((await api().patch(`/api/notifications/${n.id}/read`).set(bearer(other.token))).status).toBe(404)
    expect((await api().delete(`/api/notifications/${n.id}`).set(bearer(other.token))).status).toBe(404)
    const row = await prisma.notification.findUnique({ where: { id: n.id } })
    expect(row).toMatchObject({ readAt: null, userId: me.user.id })
  })

  it('rejects a malformed id with 400', async () => {
    const me = await registerAndLogin()
    expect((await api().patch('/api/notifications/nope/read').set(bearer(me.token))).status).toBe(400)
  })

  it('deleting the user or the event removes their notifications', async () => {
    const me = await registerAndLogin()
    const ev = (await api().post('/api/events').set(bearer(me.token)).send({ title: 'E', category: 'other', startAt: '2030-05-10T10:00', timezone: 'Asia/Dhaka', travelDurationMinutes: 30, preparationMinutes: 30, arrivalBufferMinutes: 10 })).body.data.event
    await seed(me.user.id, { eventId: ev.id })
    await api().delete(`/api/events/${ev.id}`).set(bearer(me.token))
    expect(await prisma.notification.count({ where: { userId: me.user.id } })).toBe(0)
  })

  it('the dedupe key is unique in the database', async () => {
    const me = await registerAndLogin()
    await seed(me.user.id, { dedupeKey: 'same-key' })
    await expect(seed(me.user.id, { dedupeKey: 'same-key' })).rejects.toThrow()
  })
})

describe('notification preferences (stored in PostgreSQL, per user)', () => {
  const get = (token) => api().get('/api/users/me/notification-preferences').set(bearer(token))
  const patch = (token, body) => api().patch('/api/users/me/notification-preferences').set(bearer(token)).send(body)

  it('defaults: in-app on, every type on, lead 10 minutes, browser alerts off', async () => {
    const me = await registerAndLogin()
    expect((await get(me.token)).body.data.preferences).toEqual({ enabled: true, upcoming: true, prep: true, departure: true, checklist: true, leadMinutes: 10, browser: false })
  })

  it('updates only the given settings, persists them, and does not touch another user', async () => {
    const me = await registerAndLogin()
    const other = await registerAndLogin()
    const res = await patch(me.token, { departure: false, leadMinutes: 15, browser: true })
    expect(res.status).toBe(200)
    expect(res.body.data.preferences).toMatchObject({ enabled: true, departure: false, leadMinutes: 15, browser: true })
    expect((await get(me.token)).body.data.preferences.leadMinutes).toBe(15)
    expect((await get(other.token)).body.data.preferences).toMatchObject({ departure: true, leadMinutes: 10, browser: false })
    expect(await prisma.userPreference.findUnique({ where: { userId: me.user.id }, select: { notifyDeparture: true } })).toEqual({ notifyDeparture: false })
  })

  it('validates input: empty body, unknown field, bad lead, non-boolean', async () => {
    const me = await registerAndLogin()
    expect((await patch(me.token, {})).status).toBe(400)
    expect((await patch(me.token, { userId: 'x' })).status).toBe(400)
    expect((await patch(me.token, { leadMinutes: 7 })).status).toBe(400)
    expect((await patch(me.token, { enabled: 'yes' })).status).toBe(400)
  })
})
