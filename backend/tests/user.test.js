import { describe, expect, it } from 'vitest'
import { prisma } from '../src/config/database.js'
import { api, bearer, registerAndLogin } from './helpers.js'

describe('user endpoints require authentication', () => {
  it.each([
    ['get', '/api/users/me'],
    ['patch', '/api/users/me'],
    ['get', '/api/users/me/preferences'],
    ['patch', '/api/users/me/preferences'],
  ])('%s %s -> 401 without a token', async (method, url) => {
    expect((await api()[method](url)).status).toBe(401)
  })
})

describe('profile', () => {
  it('returns and updates only the caller name', async () => {
    const { token, body } = await registerAndLogin()
    const get = await api().get('/api/users/me').set(bearer(token))
    expect(get.status).toBe(200)
    expect(get.body.data.user.email).toBe(body.email)

    const patch = await api().patch('/api/users/me').set(bearer(token)).send({ name: '  New Name ' })
    expect(patch.status).toBe(200)
    expect(patch.body.data.user.name).toBe('New Name')
  })

  it.each([{ id: 'x' }, { passwordHash: 'x' }, { role: 'admin' }, { email: 'a@b.co' }])(
    'refuses protected field %o (400)',
    async (extra) => {
      const { token } = await registerAndLogin()
      const res = await api().patch('/api/users/me').set(bearer(token)).send({ name: 'Okay Name', ...extra })
      expect(res.status).toBe(400)
    },
  )

  it('rejects an empty update (400)', async () => {
    const { token } = await registerAndLogin()
    expect((await api().patch('/api/users/me').set(bearer(token)).send({})).status).toBe(400)
  })
})

describe('preferences', () => {
  it('reads defaults and applies valid updates', async () => {
    const { token } = await registerAndLogin()
    const get = await api().get('/api/users/me/preferences').set(bearer(token))
    expect(get.status).toBe(200)
    expect(get.body.data.preferences.defaultPreparationMinutes).toBe(30)

    const patch = await api()
      .patch('/api/users/me/preferences')
      .set(bearer(token))
      .send({ defaultPreparationMinutes: 45, preferredTravelMode: 'transit', timezone: 'Europe/London' })
    expect(patch.status).toBe(200)
    expect(patch.body.data.preferences).toMatchObject({
      defaultPreparationMinutes: 45,
      defaultArrivalBufferMinutes: 10,
      preferredTravelMode: 'transit',
      timezone: 'Europe/London',
    })
  })

  it.each([
    { defaultPreparationMinutes: -1 },
    { defaultPreparationMinutes: 'abc' },
    { defaultPreparationMinutes: 1.5 },
    { defaultArrivalBufferMinutes: 9999 },
    { preferredTravelMode: 'teleport' },
    { timezone: 'Mars/Phobos' },
    { userId: 'someone-else' },
    {},
  ])('rejects invalid update %o (400)', async (payload) => {
    const { token } = await registerAndLogin()
    expect((await api().patch('/api/users/me/preferences').set(bearer(token)).send(payload)).status).toBe(400)
  })
})

describe('user isolation', () => {
  it('user A only ever sees and changes their own data', async () => {
    const a = await registerAndLogin({ name: 'User A' })
    const b = await registerAndLogin({ name: 'User B' })

    const meA = await api().get('/api/users/me').set(bearer(a.token))
    expect(meA.body.data.user.id).toBe(a.user.id)
    expect(meA.body.data.user.id).not.toBe(b.user.id)

    // A cannot target B by smuggling ids: unknown keys are rejected...
    const smuggle = await api()
      .patch('/api/users/me/preferences')
      .set(bearer(a.token))
      .send({ userId: b.user.id, defaultPreparationMinutes: 99 })
    expect(smuggle.status).toBe(400)

    // ...and A's legitimate updates do not touch B.
    await api().patch('/api/users/me/preferences').set(bearer(a.token)).send({ defaultPreparationMinutes: 99 })
    await api().patch('/api/users/me').set(bearer(a.token)).send({ name: 'A Renamed' })

    const prefB = await api().get('/api/users/me/preferences').set(bearer(b.token))
    expect(prefB.body.data.preferences.defaultPreparationMinutes).toBe(30)
    const rowB = await prisma.user.findUnique({ where: { id: b.user.id } })
    expect(rowB.name).toBe('User B')

    // There is no route that addresses another user by id.
    expect((await api().get(`/api/users/${b.user.id}`).set(bearer(a.token))).status).toBe(404)
    expect((await api().get(`/api/users/${b.user.id}/preferences`).set(bearer(a.token))).status).toBe(404)
  })
})
