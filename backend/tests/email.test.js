import bcrypt from 'bcrypt'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/config/database.js'
import { emailConfig } from '../src/config/email.config.js'
import { hashToken } from '../src/services/authToken.service.js'
import { api, bearer, flushEmails, mailbox, registerAndLogin, uniqueEmail, validRegistration } from './helpers.js'
import { tokenFrom } from './mailbox.js'

async function register(overrides) {
  const body = validRegistration(overrides)
  const res = await api().post('/api/auth/register').send(body)
  await flushEmails()
  return { body, res, token: res.body.data?.token, user: res.body.data?.user }
}
// newest matching email
const mailTo = (email, subjectPart) => mailbox.to(email).filter((m) => m.subject.includes(subjectPart)).at(-1)
const row = (email) => prisma.user.findUnique({ where: { email } })
const tokenRow = (raw) => prisma.authToken.findUnique({ where: { tokenHash: hashToken(raw) } })
const login = (email, password) => api().post('/api/auth/login').send({ email, password })

describe('registration sends a verification email', () => {
  it('queues one email with a verification link, stores only the token HASH, and marks nobody verified', async () => {
    const { body, res } = await register()
    expect(res.status).toBe(201)
    expect(res.body.data.user.emailVerified).toBe(false)
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenVersion|emailVerifiedAt/)

    expect(mailbox.sent).toHaveLength(1)
    const mail = mailbox.sent[0]
    expect(mail.to).toBe(body.email)
    expect(mail.subject).toMatch(/Verify your email/)
    expect(mail.text).toContain(`${emailConfig.appBaseUrl}/verify-email?token=`)
    expect(mail.html).toContain('Verify email address')
    expect(mail.text + mail.html).not.toContain(body.password)

    const raw = tokenFrom(mail)
    expect(raw).toHaveLength(43) // 32 random bytes, base64url
    const stored = await tokenRow(raw)
    expect(stored).toMatchObject({ type: 'EMAIL_VERIFY', usedAt: null })
    expect(stored.tokenHash).not.toBe(raw)
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    const hours = (stored.expiresAt - Date.now()) / 3_600_000
    expect(hours).toBeGreaterThan(23.9)
    expect(hours).toBeLessThanOrEqual(24)
    expect(await prisma.authToken.count({ where: { tokenHash: raw } })).toBe(0) // plaintext is never stored

    const u = await row(body.email)
    expect(u.emailVerifiedAt).toBeNull()
    expect(u.emailVerificationRequired).toBe(false)
  })

  it('logs the attempt as ACCEPTED with the provider message id, without tokens or URLs', async () => {
    const { body } = await register()
    const logs = await prisma.emailLog.findMany({ where: { recipient: body.email } })
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ emailType: 'EMAIL_VERIFY', provider: 'mock', status: 'ACCEPTED', providerMessageId: 'msg_1', attempts: 1, errorCode: null })
    const raw = tokenFrom(mailbox.sent[0])
    const dump = JSON.stringify(logs)
    expect(dump).not.toContain(raw)
    expect(dump).not.toMatch(/verify-email|token=|http/)
  })

  it('a provider outage never breaks registration (the failure is logged as FAILED)', async () => {
    mailbox.failNext(1, { retryable: false, code: 'invalid_api_key' })
    const { body, res } = await register()
    expect(res.status).toBe(201)
    expect(res.body.data.token).toEqual(expect.any(String))
    const log = await prisma.emailLog.findFirst({ where: { recipient: body.email } })
    expect(log).toMatchObject({ status: 'FAILED', errorCode: 'invalid_api_key', attempts: 1 })
    expect(mailbox.sent).toHaveLength(0)
  })

  it('still rejects a duplicate email and sends no second verification email', async () => {
    const { body } = await register()
    const dup = await api().post('/api/auth/register').send({ ...body, email: body.email.toUpperCase() })
    await flushEmails()
    expect(dup.status).toBe(409)
    expect(mailbox.sent).toHaveLength(1)
  })

  it('mandatory mode: no session on registration, login blocked until verified, then allowed', async () => {
    emailConfig.verificationRequired = true
    const { body, res } = await register()
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ token: null, verificationRequired: true })
    expect((await row(body.email)).emailVerificationRequired).toBe(true)

    const blocked = await login(body.email, body.password)
    expect(blocked.status).toBe(403)
    expect(blocked.body.code).toBe('EMAIL_NOT_VERIFIED')
    expect((await login(body.email, 'WrongPassword1')).status).toBe(401) // wrong password still gives the generic 401

    await api().post('/api/auth/verify-email').send({ token: tokenFrom(mailbox.sent[0]) })
    const ok = await login(body.email, body.password)
    expect(ok.status).toBe(200)
    expect(ok.body.data.user.emailVerified).toBe(true)
  })
})

describe('existing users keep working (backward compatibility)', () => {
  it('a user created before this feature (never verified, enforcement off) can still log in, even if enforcement is later switched on', async () => {
    const email = uniqueEmail('legacy')
    const passwordHash = await bcrypt.hash('Sup3rSecret!', 4)
    await prisma.user.create({ data: { name: 'Legacy User', email, passwordHash, preference: { create: {} } } }) // no email fields at all
    const legacy = await row(email)
    expect(legacy.emailVerifiedAt).toBeNull() // NOT auto-verified
    expect(legacy.emailVerificationRequired).toBe(false)

    emailConfig.verificationRequired = true // enforcement only affects NEW accounts
    const res = await login(email, 'Sup3rSecret!')
    expect(res.status).toBe(200)
    expect(res.body.data.user.emailVerified).toBe(false)
    const me = await api().get('/api/auth/me').set(bearer(res.body.data.token))
    expect(me.status).toBe(200)
    expect(me.body.data.user.emailVerified).toBe(false)
  })
})

describe('POST /api/auth/verify-email', () => {
  it('verifies the address, marks the token used, and the token cannot be reused', async () => {
    const { body, token } = await register()
    const raw = tokenFrom(mailbox.sent[0])
    const ok = await api().post('/api/auth/verify-email').send({ token: raw })
    expect(ok.status).toBe(200)
    expect((await row(body.email)).emailVerifiedAt).toBeInstanceOf(Date)
    expect((await tokenRow(raw)).usedAt).toBeInstanceOf(Date)
    expect((await api().get('/api/auth/me').set(bearer(token))).body.data.user.emailVerified).toBe(true)

    const again = await api().post('/api/auth/verify-email').send({ token: raw })
    expect(again.status).toBe(400)
    expect(again.body.code).toBe('TOKEN_USED')
  })

  it('rejects an expired token (400 TOKEN_EXPIRED) and leaves the user unverified', async () => {
    const { body } = await register()
    const raw = tokenFrom(mailbox.sent[0])
    await prisma.authToken.update({ where: { tokenHash: hashToken(raw) }, data: { expiresAt: new Date(Date.now() - 1000) } })
    const res = await api().post('/api/auth/verify-email').send({ token: raw })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('TOKEN_EXPIRED')
    expect((await row(body.email)).emailVerifiedAt).toBeNull()
  })

  it('rejects unknown tokens, malformed tokens, and tokens of another type', async () => {
    const { body } = await register()
    expect((await api().post('/api/auth/verify-email').send({ token: 'a'.repeat(43) })).body.code).toBe('INVALID_TOKEN')
    expect((await api().post('/api/auth/verify-email').send({ token: 'short' })).status).toBe(400)
    expect((await api().post('/api/auth/verify-email').send({})).status).toBe(400)
    expect((await api().post('/api/auth/verify-email').send({ token: 'x'.repeat(500) })).status).toBe(400)

    await api().post('/api/auth/forgot-password').send({ email: body.email })
    await flushEmails()
    const resetToken = tokenFrom(mailTo(body.email, 'Reset your'))
    const wrongType = await api().post('/api/auth/verify-email').send({ token: resetToken })
    expect(wrongType.body.code).toBe('INVALID_TOKEN')
    expect((await row(body.email)).emailVerifiedAt).toBeNull()
  })
})

describe('POST /api/auth/resend-verification', () => {
  it('gives the same answer for unknown and known addresses; only an unverified account gets a new email', async () => {
    const { body } = await register()
    mailbox.reset()
    const unknown = await api().post('/api/auth/resend-verification').send({ email: uniqueEmail('ghost') })
    await flushEmails()
    expect(unknown.status).toBe(200)
    expect(mailbox.sent).toHaveLength(0)

    // age the first token so the cooldown does not apply
    await prisma.authToken.updateMany({ where: { user: { email: body.email } }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } })
    const known = await api().post('/api/auth/resend-verification').send({ email: body.email })
    await flushEmails()
    expect(known.status).toBe(200)
    expect(known.body).toEqual(unknown.body) // identical response: no account enumeration
    expect(mailbox.sent).toHaveLength(1)
  })

  it('supersedes the old link: only the newest verification link works', async () => {
    const { body } = await register()
    const oldToken = tokenFrom(mailbox.sent[0])
    await prisma.authToken.updateMany({ where: { user: { email: body.email } }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } })
    await api().post('/api/auth/resend-verification').send({ email: body.email })
    await flushEmails()
    const newToken = tokenFrom(mailbox.sent[1])
    expect(newToken).not.toBe(oldToken)
    expect((await api().post('/api/auth/verify-email').send({ token: oldToken })).body.code).toBe('INVALID_TOKEN')
    expect((await api().post('/api/auth/verify-email').send({ token: newToken })).status).toBe(200)
  })

  it('has a per-account cooldown (no mail bombing) and sends nothing to verified accounts', async () => {
    const { body } = await register()
    mailbox.reset()
    await api().post('/api/auth/resend-verification').send({ email: body.email }) // token created seconds ago
    await flushEmails()
    expect(mailbox.sent).toHaveLength(0)

    await prisma.user.update({ where: { email: body.email }, data: { emailVerifiedAt: new Date() } })
    await prisma.authToken.deleteMany({ where: { user: { email: body.email } } })
    await api().post('/api/auth/resend-verification').send({ email: body.email })
    await flushEmails()
    expect(mailbox.sent).toHaveLength(0)
  })

  it('is rate limited per IP (429)', async () => {
    const limited = request(createApp({ authRateLimit: { limit: 2, windowMs: 60_000 } }))
    const hit = () => limited.post('/api/auth/resend-verification').send({ email: uniqueEmail('rl') })
    expect((await hit()).status).toBe(200)
    expect((await hit()).status).toBe(200)
    const blocked = await hit()
    expect(blocked.status).toBe(429)
    expect(blocked.body.code).toBe('RATE_LIMITED')
  })

  it('validates the email (400)', async () => {
    expect((await api().post('/api/auth/resend-verification').send({ email: 'nope' })).status).toBe(400)
  })
})

describe('forgot password / reset password', () => {
  it('existing account: generic 200, a reset email with a 30 minute single-use hashed token', async () => {
    const { body } = await register()
    mailbox.reset()
    const res = await api().post('/api/auth/forgot-password').send({ email: body.email })
    await flushEmails()
    expect(res.status).toBe(200)
    const mail = mailTo(body.email, 'Reset your')
    expect(mail).toBeTruthy()
    expect(mail.text).toContain(`${emailConfig.appBaseUrl}/reset-password?token=`)
    const stored = await tokenRow(tokenFrom(mail))
    expect(stored.type).toBe('PASSWORD_RESET')
    const minutes = (stored.expiresAt - Date.now()) / 60_000
    expect(minutes).toBeGreaterThan(29)
    expect(minutes).toBeLessThanOrEqual(30)
    const log = await prisma.emailLog.findFirst({ where: { recipient: body.email, emailType: 'PASSWORD_RESET' } })
    expect(JSON.stringify(log)).not.toContain(tokenFrom(mail))
  })

  it('unknown account: the response is identical and nothing is sent or stored', async () => {
    const { body } = await register()
    const known = await api().post('/api/auth/forgot-password').send({ email: body.email })
    await flushEmails()
    mailbox.reset()
    const before = await prisma.authToken.count()
    const unknown = await api().post('/api/auth/forgot-password').send({ email: uniqueEmail('ghost') })
    await flushEmails()
    expect(unknown.status).toBe(known.status)
    expect(unknown.body).toEqual(known.body)
    expect(mailbox.sent).toHaveLength(0)
    expect(await prisma.authToken.count()).toBe(before)
  })

  it('has a cooldown: a second request within a minute does not send another email', async () => {
    const { body } = await register()
    mailbox.reset()
    await api().post('/api/auth/forgot-password').send({ email: body.email })
    await api().post('/api/auth/forgot-password').send({ email: body.email })
    await flushEmails()
    expect(mailbox.sent).toHaveLength(1)
  })

  async function requestReset(email) {
    await api().post('/api/auth/forgot-password').send({ email })
    await flushEmails()
    return tokenFrom(mailTo(email, 'Reset your'))
  }

  it('resets the password: hashed, token consumed, old sessions revoked, confirmation email sent', async () => {
    const { body, token: oldJwt } = await register()
    const raw = await requestReset(body.email)
    mailbox.reset()
    const res = await api().post('/api/auth/reset-password').send({ token: raw, password: 'BrandNewPass9', confirmPassword: 'BrandNewPass9' })
    await flushEmails()
    expect(res.status).toBe(200)

    const u = await row(body.email)
    expect(u.passwordHash).not.toBe('BrandNewPass9')
    expect(u.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/)
    expect(await bcrypt.compare('BrandNewPass9', u.passwordHash)).toBe(true)
    expect((await tokenRow(raw)).usedAt).toBeInstanceOf(Date)

    expect((await login(body.email, body.password)).status).toBe(401) // old password dead
    expect((await login(body.email, 'BrandNewPass9')).status).toBe(200)
    expect((await api().get('/api/auth/me').set(bearer(oldJwt))).status).toBe(401) // old JWT revoked

    const changed = mailTo(body.email, 'password was changed')
    expect(changed).toBeTruthy()
    expect(changed.text + changed.html).not.toContain('BrandNewPass9')
  })

  it('a reset token works once only (400 TOKEN_USED) and other outstanding reset tokens are invalidated', async () => {
    const { body } = await register()
    const first = await requestReset(body.email)
    await prisma.authToken.updateMany({ where: { user: { email: body.email } }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } })
    const second = await requestReset(body.email)
    expect(second).not.toBe(first)
    expect((await api().post('/api/auth/reset-password').send({ token: first, password: 'BrandNewPass9', confirmPassword: 'BrandNewPass9' })).body.code).toBe('INVALID_TOKEN')

    const ok = await api().post('/api/auth/reset-password').send({ token: second, password: 'BrandNewPass9', confirmPassword: 'BrandNewPass9' })
    expect(ok.status).toBe(200)
    const reuse = await api().post('/api/auth/reset-password').send({ token: second, password: 'AnotherPass99', confirmPassword: 'AnotherPass99' })
    expect(reuse.status).toBe(400)
    expect(reuse.body.code).toBe('TOKEN_USED')
    expect((await login(body.email, 'AnotherPass99')).status).toBe(401)
  })

  it('rejects an expired token and leaves the password unchanged', async () => {
    const { body } = await register()
    const raw = await requestReset(body.email)
    await prisma.authToken.update({ where: { tokenHash: hashToken(raw) }, data: { expiresAt: new Date(Date.now() - 1000) } })
    const res = await api().post('/api/auth/reset-password').send({ token: raw, password: 'BrandNewPass9', confirmPassword: 'BrandNewPass9' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('TOKEN_EXPIRED')
    expect((await login(body.email, body.password)).status).toBe(200)
  })

  it.each([
    ['weak password', { password: 'short', confirmPassword: 'short' }],
    ['mismatch', { password: 'BrandNewPass9', confirmPassword: 'Different999' }],
    ['over-long password', { password: 'x'.repeat(73), confirmPassword: 'x'.repeat(73) }],
    ['unknown field', { password: 'BrandNewPass9', confirmPassword: 'BrandNewPass9', userId: 'x' }],
  ])('rejects %s (400) without consuming the token', async (_name, extra) => {
    const { body } = await register()
    const raw = await requestReset(body.email)
    const res = await api().post('/api/auth/reset-password').send({ token: raw, ...extra })
    expect(res.status).toBe(400)
    expect((await tokenRow(raw)).usedAt).toBeNull()
  })
})

describe('changing the email address', () => {
  const change = (jwt, newEmail, password = 'Sup3rSecret!') => api().post('/api/users/me/email-change').set(bearer(jwt)).send({ newEmail, password })

  it('requires authentication (401)', async () => {
    expect((await api().post('/api/users/me/email-change').send({ newEmail: uniqueEmail(), password: 'x' })).status).toBe(401)
  })

  it('requires the correct password (403, not 401) and sends nothing', async () => {
    const { token } = await register()
    mailbox.reset()
    const res = await change(token, uniqueEmail('new'), 'WrongPassword1')
    await flushEmails()
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('INVALID_PASSWORD')
    expect(mailbox.sent).toHaveLength(0)
  })

  it('does not change the address until the NEW address confirms; then notifies the OLD address and revokes sessions', async () => {
    const { body, token } = await register()
    const newEmail = uniqueEmail('new')
    mailbox.reset()
    const res = await change(token, newEmail)
    await flushEmails()
    expect(res.status).toBe(200)
    expect((await row(body.email)).email).toBe(body.email) // unchanged
    const confirmMail = mailTo(newEmail, 'Confirm your new')
    expect(confirmMail).toBeTruthy()
    expect(mailbox.to(body.email)).toHaveLength(0)

    mailbox.reset()
    const raw = tokenFrom(confirmMail)
    const done = await api().post('/api/auth/confirm-email-change').send({ token: raw })
    await flushEmails()
    expect(done.status).toBe(200)

    const u = await row(newEmail)
    expect(u).toBeTruthy()
    expect(u.emailVerifiedAt).toBeInstanceOf(Date)
    expect(await row(body.email)).toBeNull()
    expect((await api().get('/api/auth/me').set(bearer(token))).status).toBe(401) // old JWT revoked
    expect((await login(newEmail, body.password)).status).toBe(200)
    expect((await login(body.email, body.password)).status).toBe(401)

    const notice = mailTo(body.email, 'was changed')
    expect(notice).toBeTruthy()
    expect(notice.text).not.toContain(newEmail) // only a masked form is shown
    expect((await api().post('/api/auth/confirm-email-change').send({ token: raw })).body.code).toBe('TOKEN_USED')
  })

  it('an address that already belongs to someone else gets the same response and no email (no enumeration)', async () => {
    const a = await register()
    const b = await register()
    mailbox.reset()
    const free = await change(a.token, uniqueEmail('free'))
    await prisma.authToken.deleteMany({ where: { user: { email: a.body.email } } }) // clear cooldown
    const taken = await change(a.token, b.body.email)
    await flushEmails()
    expect(taken.status).toBe(free.status)
    expect(taken.body).toEqual(free.body)
    expect(mailbox.sent).toHaveLength(1) // only the free address got a mail
    expect((await row(b.body.email)).id).toBe(b.user.id)
  })

  it('a race (address taken after the link was sent) returns 409 and changes nothing', async () => {
    const a = await register()
    const target = uniqueEmail('race')
    await change(a.token, target)
    await flushEmails()
    const raw = tokenFrom(mailTo(target, 'Confirm your new'))
    await register({ email: target }) // someone registers it in the meantime
    const res = await api().post('/api/auth/confirm-email-change').send({ token: raw })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('EMAIL_TAKEN')
    expect((await row(a.body.email)).id).toBe(a.user.id)
  })

  it('rejects the current address (400), invalid addresses (400) and rapid repeats (429)', async () => {
    const { body, token } = await register()
    expect((await change(token, body.email)).status).toBe(400)
    expect((await change(token, 'nope')).status).toBe(400)
    expect((await change(token, uniqueEmail('n1'))).status).toBe(200)
    expect((await change(token, uniqueEmail('n2'))).status).toBe(429)
  })
})

describe('email preferences', () => {
  it('requires auth; returns defaults (reminders OFF) plus the non-optional emails', async () => {
    expect((await api().get('/api/users/me/email-preferences')).status).toBe(401)
    expect((await api().patch('/api/users/me/email-preferences').send({})).status).toBe(401)
    const { token } = await registerAndLogin()
    const res = await api().get('/api/users/me/email-preferences').set(bearer(token))
    expect(res.status).toBe(200)
    expect(res.body.data.preferences).toEqual({
      required: { security: true, emailVerification: true, passwordReset: true },
      upcomingEventReminders: false,
      prepStartReminders: false,
      departureReminders: false,
    })
  })

  it('updates only the optional reminder types, partially', async () => {
    const { token } = await registerAndLogin()
    const res = await api().patch('/api/users/me/email-preferences').set(bearer(token)).send({ departureReminders: true })
    expect(res.status).toBe(200)
    expect(res.body.data.preferences).toMatchObject({ departureReminders: true, prepStartReminders: false, upcomingEventReminders: false })
    const again = await api().patch('/api/users/me/email-preferences').set(bearer(token)).send({ upcomingEventReminders: true, prepStartReminders: true })
    expect(again.body.data.preferences).toMatchObject({ departureReminders: true, prepStartReminders: true, upcomingEventReminders: true })
  })

  it.each([
    ['disabling security emails', { security: false }],
    ['disabling password reset emails', { passwordReset: false }],
    ['disabling verification emails', { emailVerification: false }],
    ['a user id', { userId: '00000000-0000-4000-8000-000000000000', departureReminders: true }],
    ['a non-boolean', { departureReminders: 'yes' }],
    ['an empty update', {}],
  ])('rejects %s (400)', async (_name, payload) => {
    const { token } = await registerAndLogin()
    expect((await api().patch('/api/users/me/email-preferences').set(bearer(token)).send(payload)).status).toBe(400)
  })

  it('is isolated per user', async () => {
    const a = await registerAndLogin()
    const b = await registerAndLogin()
    await api().patch('/api/users/me/email-preferences').set(bearer(a.token)).send({ departureReminders: true, prepStartReminders: true })
    const prefB = (await api().get('/api/users/me/email-preferences').set(bearer(b.token))).body.data.preferences
    expect(prefB).toMatchObject({ departureReminders: false, prepStartReminders: false })
  })

  it('does not change the existing travel/timezone preferences endpoint shape', async () => {
    const { token } = await registerAndLogin()
    const res = await api().get('/api/users/me/preferences').set(bearer(token))
    expect(Object.keys(res.body.data.preferences).sort()).toEqual(['defaultArrivalBufferMinutes', 'defaultPreparationMinutes', 'preferredTravelMode', 'timezone'])
  })
})
