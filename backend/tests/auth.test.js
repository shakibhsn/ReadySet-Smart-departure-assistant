import jwt from 'jsonwebtoken'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { prisma } from '../src/config/database.js'
import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import { api, bearer, registerAndLogin, uniqueEmail, validRegistration } from './helpers.js'

describe('POST /api/auth/register', () => {
  it('creates a user with default preferences and returns a token (201)', async () => {
    const body = validRegistration({ name: '  Alex  ', email: `  ${uniqueEmail('MiXeD').toUpperCase()}  ` })
    const res = await api().post('/api/auth/register').send(body)

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.token).toEqual(expect.any(String))
    expect(res.body.data.user).toMatchObject({ name: 'Alex', email: body.email.trim().toLowerCase() })
    expect(res.body.data.user.preference).toMatchObject({
      defaultPreparationMinutes: 30,
      defaultArrivalBufferMinutes: 10,
      preferredTravelMode: 'manual',
      timezone: 'Asia/Dhaka',
    })
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash/)

    const pref = await prisma.userPreference.findUnique({ where: { userId: res.body.data.user.id } })
    expect(pref).not.toBeNull()
  })

  it('stores a bcrypt hash, never the plain password', async () => {
    const body = validRegistration()
    await api().post('/api/auth/register').send(body)
    const row = await prisma.user.findUnique({ where: { email: body.email } })
    expect(row.passwordHash).not.toBe(body.password)
    expect(row.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/)
  })

  it('rejects missing fields (400)', async () => {
    const res = await api().post('/api/auth/register').send({})
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    const fields = res.body.errors.map((e) => e.field)
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password', 'confirmPassword']))
  })

  it('rejects an invalid email (400)', async () => {
    const res = await api().post('/api/auth/register').send(validRegistration({ email: 'not-an-email' }))
    expect(res.status).toBe(400)
    expect(res.body.errors.some((e) => e.field === 'email')).toBe(true)
  })

  it('rejects a weak password (400)', async () => {
    const res = await api().post('/api/auth/register').send(validRegistration({ password: 'short', confirmPassword: 'short' }))
    expect(res.status).toBe(400)
    expect(res.body.errors.some((e) => e.field === 'password')).toBe(true)
  })

  it('rejects mismatched passwords (400)', async () => {
    const res = await api().post('/api/auth/register').send(validRegistration({ confirmPassword: 'different123' }))
    expect(res.status).toBe(400)
    expect(res.body.errors.some((e) => e.field === 'confirmPassword')).toBe(true)
  })

  it('rejects unknown fields so protected fields cannot be injected (400)', async () => {
    const res = await api().post('/api/auth/register').send({ ...validRegistration(), role: 'admin' })
    expect(res.status).toBe(400)
  })

  it('rejects a duplicate email, case-insensitively (409)', async () => {
    const body = validRegistration()
    await api().post('/api/auth/register').send(body)
    const res = await api().post('/api/auth/register').send({ ...body, email: body.email.toUpperCase() })
    expect(res.status).toBe(409)
    expect(res.body.success).toBe(false)
  })
})

describe('POST /api/auth/login', () => {
  it('logs in with valid credentials (200)', async () => {
    const { body } = await registerAndLogin()
    const res = await api().post('/api/auth/login').send({ email: body.email.toUpperCase(), password: body.password })
    expect(res.status).toBe(200)
    expect(res.body.data.token).toEqual(expect.any(String))
    expect(res.body.data.user.email).toBe(body.email)
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash/)
  })

  it('rejects an incorrect password with a generic message (401)', async () => {
    const { body } = await registerAndLogin()
    const res = await api().post('/api/auth/login').send({ email: body.email, password: 'WrongPassword1' })
    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Invalid email or password')
  })

  it('rejects an unknown email with the SAME message (401)', async () => {
    const res = await api().post('/api/auth/login').send({ email: uniqueEmail('ghost'), password: 'Whatever123' })
    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Invalid email or password')
  })

  it('rejects missing fields (400)', async () => {
    const res = await api().post('/api/auth/login').send({})
    expect(res.status).toBe(400)
  })

  it('rate limits repeated attempts (429)', async () => {
    const limited = request(createApp({ authRateLimit: { limit: 3, windowMs: 60_000 } }))
    const attempt = () => limited.post('/api/auth/login').send({ email: uniqueEmail('rl'), password: 'Whatever123' })
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401)
    expect((await attempt()).status).toBe(429)
  })
})

describe('JWT authentication (GET /api/auth/me)', () => {
  it('rejects a missing token (401)', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401)
  })

  it('rejects a malformed / invalid token (401)', async () => {
    expect((await api().get('/api/auth/me').set(bearer('garbage'))).status).toBe(401)
    expect((await api().get('/api/auth/me').set('Authorization', 'Token abc')).status).toBe(401)
    const wrongSecret = jwt.sign({ sub: 'x' }, 'another-secret-that-is-long-enough-123456')
    expect((await api().get('/api/auth/me').set(bearer(wrongSecret))).status).toBe(401)
  })

  it('rejects an unsigned (alg=none) token (401)', async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'x' })}.`
    expect((await api().get('/api/auth/me').set(bearer(none))).status).toBe(401)
  })

  it('rejects an expired token (401)', async () => {
    const { user } = await registerAndLogin()
    const expired = jwt.sign({ sub: user.id }, env.JWT_SECRET, { expiresIn: -10 })
    const res = await api().get('/api/auth/me').set(bearer(expired))
    expect(res.status).toBe(401)
    expect(res.body.message).toMatch(/expired/i)
  })

  it('accepts a valid token and returns the user with preferences (200)', async () => {
    const { token, body } = await registerAndLogin()
    const res = await api().get('/api/auth/me').set(bearer(token))
    expect(res.status).toBe(200)
    expect(res.body.data.user.email).toBe(body.email)
    expect(res.body.data.user.preference.defaultPreparationMinutes).toBe(30)
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash/)
  })

  it('rejects a valid token whose user was deleted (401)', async () => {
    const { token, user } = await registerAndLogin()
    await prisma.user.delete({ where: { id: user.id } })
    expect((await api().get('/api/auth/me').set(bearer(token))).status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  it('returns 200 and explains logout is client-side', async () => {
    const res = await api().post('/api/auth/logout')
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/client/i)
  })
})

describe('misc', () => {
  it('returns 404 JSON for unknown routes and 400 for malformed JSON', async () => {
    expect((await api().get('/api/nope')).status).toBe(404)
    const bad = await api().post('/api/auth/login').set('Content-Type', 'application/json').send('{bad')
    expect(bad.status).toBe(400)
    expect(bad.body.success).toBe(false)
  })

  it('cascades: deleting a user removes their preference row', async () => {
    const { user } = await registerAndLogin()
    await prisma.user.delete({ where: { id: user.id } })
    expect(await prisma.userPreference.findUnique({ where: { userId: user.id } })).toBeNull()
  })
})
