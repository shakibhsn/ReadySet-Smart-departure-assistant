import { spawnSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { prisma } from '../src/config/database.js'
import { emailConfig } from '../src/config/email.config.js'
import { EmailProviderError } from '../src/services/email/emailProvider.js'
import { createConsoleProvider } from '../src/services/email/consoleProvider.js'
import { sendEmail, setEmailProvider } from '../src/services/email/emailService.js'
import { createConfiguredProvider } from '../src/services/email/providers.js'
import { createResendProvider } from '../src/services/email/resendProvider.js'
import { escapeHtml, renderEmail } from '../src/templates/baseTemplate.js'
import { emailChangeConfirmTemplate, emailChangedNoticeTemplate } from '../src/templates/emailChangeTemplates.js'
import { eventReminderTemplate } from '../src/templates/eventReminderTemplate.js'
import { passwordChangedTemplate } from '../src/templates/passwordChangedTemplate.js'
import { resetPasswordTemplate } from '../src/templates/resetPasswordTemplate.js'
import { verifyEmailTemplate } from '../src/templates/verifyEmailTemplate.js'
import { maskEmail } from '../src/utils/logger.js'
import { mailbox, registerAndLogin } from './helpers.js'

const template = { subject: 'Hello', html: '<p>Hi</p>', text: 'Hi' }
const log = (id) => prisma.emailLog.findUnique({ where: { id } })

describe('sendEmail: retries, idempotency and duplicate protection', () => {
  it('retries retryable failures with backoff, reuses ONE idempotency key, then succeeds', async () => {
    const { user } = await registerAndLogin()
    mailbox.reset()
    mailbox.failNext(2, { retryable: true, code: 'rate_limit_exceeded' })
    const spy = vi.spyOn(mailbox, 'send')
    const result = await sendEmail({ type: 'TEST', to: 'a@readyset.test', userId: user.id, template })
    expect(result.status).toBe('ACCEPTED')
    expect(spy).toHaveBeenCalledTimes(3)
    const keys = spy.mock.calls.map(([m]) => m.idempotencyKey)
    expect(new Set(keys).size).toBe(1)
    expect(keys[0]).toMatch(/^readyset\/TEST\/[0-9a-f-]{36}$/)
    expect(await log(result.logId)).toMatchObject({ status: 'ACCEPTED', attempts: 3, errorCode: null, providerMessageId: 'msg_1' })
    spy.mockRestore()
  })

  it('gives up after the maximum attempts (bounded retries) and records FAILED', async () => {
    const { user } = await registerAndLogin()
    mailbox.reset()
    mailbox.failNext(10, { retryable: true, code: 'internal_server_error' })
    const spy = vi.spyOn(mailbox, 'send')
    const result = await sendEmail({ type: 'TEST', to: 'a@readyset.test', userId: user.id, template })
    expect(result.status).toBe('FAILED')
    expect(spy).toHaveBeenCalledTimes(emailConfig.retry.maxAttempts)
    expect(await log(result.logId)).toMatchObject({ status: 'FAILED', attempts: emailConfig.retry.maxAttempts, errorCode: 'internal_server_error' })
    spy.mockRestore()
  })

  it('does not retry a permanent failure', async () => {
    const { user } = await registerAndLogin()
    mailbox.reset()
    mailbox.failNext(1, { retryable: false, code: 'invalid_from_address' })
    const spy = vi.spyOn(mailbox, 'send')
    const result = await sendEmail({ type: 'TEST', to: 'a@readyset.test', userId: user.id, template })
    expect(result.status).toBe('FAILED')
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('never throws, even if the provider throws something unexpected', async () => {
    const original = mailbox.send
    mailbox.send = async () => {
      throw new TypeError('kaboom: something unexpected')
    }
    const result = await sendEmail({ type: 'TEST', to: 'a@readyset.test', template })
    mailbox.send = original
    expect(result.status).toBe('FAILED')
  })

  it('sends a message with the same dedupeKey at most once (DUPLICATE the second time)', async () => {
    const { user } = await registerAndLogin()
    mailbox.reset()
    const first = await sendEmail({ type: 'TEST', to: 'a@readyset.test', userId: user.id, template, dedupeKey: 'unit:one' })
    const second = await sendEmail({ type: 'TEST', to: 'a@readyset.test', userId: user.id, template, dedupeKey: 'unit:one' })
    expect(first.status).toBe('ACCEPTED')
    expect(second.status).toBe('DUPLICATE')
    expect(mailbox.sent).toHaveLength(1)
  })

  it('writes only safe fields to the log (no body, tokens or URLs)', async () => {
    const { user } = await registerAndLogin()
    const secret = { subject: 'S', html: '<a href="https://x/y?token=SECRETTOKEN123">x</a>', text: 'https://x/y?token=SECRETTOKEN123' }
    const result = await sendEmail({ type: 'TEST', to: 'a@readyset.test', userId: user.id, template: secret })
    expect(JSON.stringify(await log(result.logId))).not.toContain('SECRETTOKEN123')
  })
})

describe('provider adapters', () => {
  it('Resend: maps success, passes the idempotency key, and classifies errors', async () => {
    const send = vi.fn()
    const provider = createResendProvider({ client: { emails: { send } } })

    send.mockResolvedValueOnce({ data: { id: 're_123' }, error: null })
    expect(await provider.send({ to: 'a@x.com', from: 'f', subject: 's', html: 'h', text: 't', idempotencyKey: 'k1' })).toEqual({ id: 're_123' })
    expect(send).toHaveBeenCalledWith({ from: 'f', to: 'a@x.com', subject: 's', html: 'h', text: 't' }, { idempotencyKey: 'k1' })

    const cases = [
      [{ name: 'rate_limit_exceeded', statusCode: 429 }, true],
      [{ name: 'internal_server_error', statusCode: 500 }, true],
      [{ name: 'application_error', statusCode: 500 }, true],
      [{ name: 'invalid_api_key', statusCode: 403 }, false],
      [{ name: 'validation_error', statusCode: 422 }, false],
      [{ name: 'monthly_quota_exceeded', statusCode: 429 }, true], // 429 is transient by status; quota codes are not special-cased
    ]
    for (const [error, retryable] of cases) {
      send.mockResolvedValueOnce({ data: null, error: { ...error, message: 'contains a@x.com' } })
      const err = await provider.send({ to: 'a@x.com', from: 'f', subject: 's', html: 'h', text: 't' }).catch((e) => e)
      expect(err).toBeInstanceOf(EmailProviderError)
      expect(err.code).toBe(error.name)
      expect(err.retryable).toBe(retryable)
      expect(err.message).not.toContain('a@x.com') // provider messages are not propagated
    }

    send.mockRejectedValueOnce(new Error('ECONNRESET'))
    const net = await provider.send({ to: 'a@x.com', from: 'f', subject: 's', html: 'h', text: 't' }).catch((e) => e)
    expect(net).toMatchObject({ code: 'network_error', retryable: true })
  })

  it('console mode never contacts a provider and masks the recipient; the body is printed only outside production', async () => {
    emailConfig.mode = 'console'
    const lines = []
    const spy = vi.spyOn(console, 'log').mockImplementation((s) => lines.push(s))
    await createConsoleProvider({ includeBody: false }).send({ to: 'jane.doe@example.com', subject: 'Subj', text: 'https://app/reset?token=SECRET' })
    await createConsoleProvider({ includeBody: true }).send({ to: 'jane.doe@example.com', subject: 'Subj', text: 'https://app/reset?token=SECRET' })
    spy.mockRestore()
    expect(lines[0]).not.toContain('jane.doe')
    expect(lines[0]).toContain('j***@e***.com')
    expect(lines[0]).not.toContain('SECRET') // production-style preview hides the token
    expect(lines[1]).toContain('SECRET') // dev-style preview includes it so you can click the link
    expect(createConfiguredProvider().name).toBe('console')
  })

  it('maskEmail keeps logs free of full addresses', () => {
    expect(maskEmail('jane.doe@example.co.uk')).toBe('j***@e***.uk')
  })

  it('switching provider needs only a new adapter: setEmailProvider swaps it with no other code change', async () => {
    const sent = []
    setEmailProvider({ name: 'brevo-like', send: async (m) => (sent.push(m), { id: 'b1' }) })
    const r = await sendEmail({ type: 'TEST', to: 'a@readyset.test', template })
    expect(r.status).toBe('ACCEPTED')
    expect(sent).toHaveLength(1)
    expect((await log(r.logId)).provider).toBe('brevo-like')
    setEmailProvider(mailbox)
  })
})

describe('startup configuration validation (child process, never sends anything)', () => {
  const baseEnv = {
    ...process.env,
    DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/cfg_test',
    JWT_SECRET: 'a'.repeat(40),
    FRONTEND_URL: 'http://localhost:5173',
  }
  const load = (overrides) =>
    spawnSync(process.execPath, ['--input-type=module', '-e', "import('./src/config/env.js').then((m) => console.log('LOADED', m.env.EMAIL_MODE, m.env.APP_BASE_URL))"], {
      cwd: new URL('..', import.meta.url),
      env: { ...baseEnv, ...overrides },
      encoding: 'utf8',
    })

  it('defaults to console mode and APP_BASE_URL = FRONTEND_URL', () => {
    const r = load({ NODE_ENV: 'development', EMAIL_MODE: '', RESEND_API_KEY: '', EMAIL_FROM: '', APP_BASE_URL: '' })
    expect(r.stdout).toContain('LOADED console http://localhost:5173')
  })

  it.each([
    ['provider mode without an API key', { NODE_ENV: 'development', EMAIL_MODE: 'provider', RESEND_API_KEY: '', EMAIL_FROM: 'a@b.com' }, 'RESEND_API_KEY is required'],
    ['provider mode without a from address', { NODE_ENV: 'development', EMAIL_MODE: 'provider', RESEND_API_KEY: 'x'.repeat(20), EMAIL_FROM: '' }, 'EMAIL_FROM is required'],
    ['production with console mode', { NODE_ENV: 'production', EMAIL_MODE: 'console' }, 'must be "provider" in production'],
    ['real provider mode inside tests', { NODE_ENV: 'test', EMAIL_MODE: 'provider', RESEND_API_KEY: 'x'.repeat(20), EMAIL_FROM: 'a@b.com' }, 'not allowed in tests'],
    ['a malformed EMAIL_FROM', { NODE_ENV: 'development', EMAIL_FROM: 'not-an-email' }, 'EMAIL_FROM'],
  ])('fails clearly for %s', (_name, overrides, message) => {
    const r = load(overrides)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain(message)
    expect(r.stderr).not.toContain('x'.repeat(20)) // never echoes secret values
  })
})

describe('templates', () => {
  const samples = () => [
    verifyEmailTemplate({ name: 'Sam', url: 'https://app/verify?token=abc', expiresInHours: 24 }),
    resetPasswordTemplate({ name: 'Sam', url: 'https://app/reset?token=abc', expiresInMinutes: 30 }),
    passwordChangedTemplate({ name: 'Sam', whenText: 'today' }),
    emailChangeConfirmTemplate({ name: 'Sam', url: 'https://app/c?token=abc', expiresInMinutes: 60 }),
    emailChangedNoticeTemplate({ name: 'Sam', newEmailMasked: 'n***@e***.com', whenText: 'today' }),
    eventReminderTemplate({
      name: 'Sam',
      kind: 'departure',
      event: { title: 'Class', destination: 'Room 1', timezone: 'Asia/Dhaka' },
      times: { start: 'Tue 10:00 AM', targetArrival: 'Tue 9:50 AM', departure: 'Tue 9:15 AM', prepStart: 'Tue 8:45 AM' },
      url: 'https://app/events/1',
    }),
  ]

  it('every template has a subject, branded responsive HTML and a plain-text fallback', () => {
    for (const t of samples()) {
      expect(t.subject.length).toBeGreaterThan(5)
      expect(t.html).toContain('Ready<span')
      expect(t.html).toContain('viewport')
      expect(t.html).toContain('max-width:560px')
      expect(t.text).toContain('ReadySet')
      expect(t.text).not.toMatch(/<[a-z][\s\S]*>/i)
    }
  })

  it('action emails include a button, a copy-paste link and the expiry', () => {
    const [verify, reset] = samples()
    expect(verify.html).toContain('href="https://app/verify?token=abc"')
    expect(verify.text).toContain('https://app/verify?token=abc')
    expect(verify.text).toContain('24 hours')
    expect(reset.text).toContain('30 minutes')
  })

  it('escapes HTML in every dynamic value (no injection through names or titles)', () => {
    const t = verifyEmailTemplate({ name: '<img src=x onerror=alert(1)>', url: 'https://app/v?a=1&b="2"', expiresInHours: 24 })
    expect(t.html).not.toContain('<img src=x')
    expect(t.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(t.html).toContain('&amp;b=&quot;2&quot;')
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })

  it('shows the support contact only when configured', () => {
    const original = emailConfig.supportEmail
    emailConfig.supportEmail = 'help@readyset.test'
    expect(renderEmail({ preheader: 'p', heading: 'h', paragraphs: ['x'] }).text).toContain('help@readyset.test')
    emailConfig.supportEmail = null
    expect(renderEmail({ preheader: 'p', heading: 'h', paragraphs: ['x'] }).text).not.toContain('Contact')
    emailConfig.supportEmail = original
  })
})
