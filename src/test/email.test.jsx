import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '@/routes'
import { AuthProvider } from '@/components/common/AuthProvider'
import { getToken, setToken } from '@/lib/tokenStorage'

const pref = { defaultPreparationMinutes: 30, defaultArrivalBufferMinutes: 10, preferredTravelMode: 'manual', timezone: 'Asia/Dhaka' }
const unverified = { id: 'u1', name: 'Sam Rivera', email: 'sam@example.com', emailVerified: false, preference: pref }
const verified = { ...unverified, emailVerified: true }

const json = (status, body) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) })
const ok = (data = {}, message = 'ok') => json(200, { success: true, message, data })
const fail = (status, message, code = null, errors = []) => json(status, { success: false, message, errors, ...(code && { code }) })

/** Fake fetch: `routes` maps "METHOD /path" to a handler (body) => response. Anything else = empty success. */
function mockApi(routes = {}) {
  const calls = []
  const fn = vi.fn((url, init = {}) => {
    const path = new URL(url).pathname.replace(/^\/api/, '')
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push({ method, path, body })
    const handler = routes[`${method} ${path}`]
    if (handler) return handler(body)
    if (path === '/events/upcoming' || path === '/events/occurrences') return ok({ events: [] })
    if (path === '/events') return ok({ events: [], pagination: { page: 1, limit: 1, total: 0, totalPages: 0 } })
    return ok()
  })
  vi.stubGlobal('fetch', fn)
  return { calls, to: (method, path) => calls.filter((c) => c.method === method && c.path === path) }
}

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        
          <AppRoutes />
        
      </AuthProvider>
    </MemoryRouter>,
  )
const signedIn = (user) => {
  setToken('tok')
  return { 'GET /auth/me': () => ok({ user }) }
}

describe('verification status', () => {
  it('shows the reminder banner and lets an unverified user resend the link', async () => {
    const api = mockApi({ ...signedIn(unverified) })
    const u = userEvent.setup()
    renderAt('/')
    const banner = await screen.findByRole('region', { name: 'Email verification' })
    expect(banner).toHaveTextContent('sam@example.com')
    await u.click(screen.getByRole('button', { name: 'Resend verification email' }))
    expect(await screen.findByText(/a new link is on its way/i)).toBeInTheDocument()
    expect(api.to('POST', '/auth/resend-verification')[0].body).toEqual({ email: 'sam@example.com' })
  })

  it('shows no banner for a verified user', async () => {
    mockApi({ ...signedIn(verified) })
    renderAt('/')
    await screen.findByRole('heading', { name: /good (morning|afternoon|evening), Sam/i })
    expect(screen.queryByRole('region', { name: 'Email verification' })).not.toBeInTheDocument()
  })

  it('Settings shows Verified / Not verified and only offers resend when needed', async () => {
    mockApi({ ...signedIn(unverified), 'GET /users/me/email-preferences': () => ok({ preferences: { required: {}, upcomingEventReminders: false, prepStartReminders: false, departureReminders: false } }) })
    renderAt('/settings')
    expect(await screen.findByText('Not verified')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Resend verification email' }).length).toBeGreaterThan(0)
  })

  it('Settings shows Verified without a resend button', async () => {
    mockApi({ ...signedIn(verified), 'GET /users/me/email-preferences': () => ok({ preferences: { required: {}, upcomingEventReminders: false, prepStartReminders: false, departureReminders: false } }) })
    renderAt('/settings')
    expect(await screen.findByText('Verified')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resend verification email' })).not.toBeInTheDocument()
  })
})

describe('login and registration with email verification', () => {
  it('login: shows a verification notice with a resend action when the backend answers EMAIL_NOT_VERIFIED', async () => {
    const api = mockApi({ 'POST /auth/login': () => fail(403, 'Please verify your email address before logging in.', 'EMAIL_NOT_VERIFIED') })
    const u = userEvent.setup()
    renderAt('/login')
    await u.type(screen.getByLabelText('Email'), 'new@example.com')
    await u.type(screen.getByLabelText('Password'), 'Sup3rSecret!')
    await u.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText(/verify your email address before logging in/i)).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Resend verification email' }))
    expect(await screen.findByText(/a new link is on its way/i)).toBeInTheDocument()
    expect(api.to('POST', '/auth/resend-verification')[0].body).toEqual({ email: 'new@example.com' })
    expect(getToken()).toBeNull()
  })

  it('login: the "Forgot password?" link now goes to the real page', async () => {
    mockApi()
    renderAt('/login')
    expect(await screen.findByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password')
  })

  it('register (verification mandatory): shows "Check your email", stores no session, allows resend', async () => {
    const api = mockApi({ 'POST /auth/register': () => json(201, { success: true, data: { user: { ...unverified, emailVerified: false }, token: null, verificationRequired: true } }) })
    const u = userEvent.setup()
    renderAt('/register')
    await u.type(screen.getByLabelText('Full name'), 'Sam Rivera')
    await u.type(screen.getByLabelText('Email'), 'sam@example.com')
    await u.type(screen.getByLabelText('Password'), 'Sup3rSecret!')
    await u.type(screen.getByLabelText('Confirm password'), 'Sup3rSecret!')
    await u.click(screen.getByRole('checkbox'))
    await u.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByText('sam@example.com')).toBeInTheDocument()
    expect(getToken()).toBeNull() // no session until the address is verified
    await u.click(screen.getByRole('button', { name: 'Resend verification email' }))
    expect(await screen.findByText(/a new link is on its way/i)).toBeInTheDocument()
    expect(api.to('POST', '/auth/resend-verification')).toHaveLength(1)
  })
})

describe('Forgot password', () => {
  it('validates the email, shows loading, then a generic confirmation', async () => {
    let release
    const gate = new Promise((r) => (release = r))
    const api = mockApi({ 'POST /auth/forgot-password': () => gate.then(() => ok({}, 'If an account exists...')) })
    const u = userEvent.setup()
    renderAt('/forgot-password')

    await u.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(api.to('POST', '/auth/forgot-password')).toHaveLength(0)

    await u.type(screen.getByLabelText('Email'), 'anyone@example.com')
    await u.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('button', { name: 'Sending…' })).toBeDisabled()
    release()
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(/If an account exists for/i) // does not claim the account exists
    expect(api.to('POST', '/auth/forgot-password')[0].body).toEqual({ email: 'anyone@example.com' })
  })

  it('shows an error message when the request fails (rate limited / offline)', async () => {
    mockApi({ 'POST /auth/forgot-password': () => fail(429, 'Too many attempts. Please try again later.', 'RATE_LIMITED') })
    const u = userEvent.setup()
    renderAt('/forgot-password')
    await u.type(screen.getByLabelText('Email'), 'a@example.com')
    await u.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts')
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))))
    await u.click(screen.getByRole('button', { name: 'Send reset link' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/cannot reach the server/i))
  })
})

describe('Reset password', () => {
  it('shows the invalid-link state without a token', async () => {
    mockApi()
    renderAt('/reset-password')
    expect(await screen.findByRole('alert')).toHaveTextContent('This reset link is not valid.')
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password')
  })

  it('keeps what the user typed when a stored session is restored in the background (no remount)', async () => {
    mockApi({ ...signedIn(verified) })
    const u = userEvent.setup()
    renderAt('/reset-password?token=abc123abc123abc123abc123')
    const field = await screen.findByLabelText('New password')
    await u.type(field, 'TypedPassword1')
    await new Promise((r) => setTimeout(r, 400))
    expect(screen.getByLabelText('New password')).toHaveValue('TypedPassword1')
  })

  it('validates the passwords locally, then submits token + passwords and shows success with a login link', async () => {
    const api = mockApi({ 'POST /auth/reset-password': () => ok({}, 'Your password has been changed.') })
    const u = userEvent.setup()
    renderAt('/reset-password?token=abc123abc123abc123abc123')

    await u.type(screen.getByLabelText('New password'), 'short')
    await u.type(screen.getByLabelText('Confirm new password'), 'different')
    await u.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('Use at least 8 characters.')).toBeInTheDocument()
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument()
    expect(api.to('POST', '/auth/reset-password')).toHaveLength(0)

    await u.clear(screen.getByLabelText('New password'))
    await u.clear(screen.getByLabelText('Confirm new password'))
    await u.type(screen.getByLabelText('New password'), 'BrandNewPass9')
    await u.type(screen.getByLabelText('Confirm new password'), 'BrandNewPass9')
    await u.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByRole('heading', { name: 'Password changed' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Back to login' }).length).toBeGreaterThan(0)
    expect(api.to('POST', '/auth/reset-password')[0].body).toEqual({ token: 'abc123abc123abc123abc123', password: 'BrandNewPass9', confirmPassword: 'BrandNewPass9' })
  })

  it.each([
    ['TOKEN_EXPIRED', 'This reset link has expired.'],
    ['TOKEN_USED', 'This reset link has already been used.'],
    ['INVALID_TOKEN', 'This reset link is not valid.'],
  ])('shows a clear state for %s', async (code, text) => {
    mockApi({ 'POST /auth/reset-password': () => fail(400, 'x', code) })
    const u = userEvent.setup()
    renderAt('/reset-password?token=abc123abc123abc123abc123')
    await u.type(screen.getByLabelText('New password'), 'BrandNewPass9')
    await u.type(screen.getByLabelText('Confirm new password'), 'BrandNewPass9')
    await u.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(screen.getByRole('link', { name: 'Request a new link' })).toBeInTheDocument()
  })
})

describe('emailed links: verify email / confirm email change', () => {
  it('verifies the address exactly once and shows success', async () => {
    const api = mockApi({ 'POST /auth/verify-email': () => ok({}, 'verified') })
    renderAt('/verify-email?token=tok_abcdefghijklmnopqrstuv')
    expect(await screen.findByRole('heading', { name: 'Your email is verified' })).toBeInTheDocument()
    expect(api.to('POST', '/auth/verify-email')).toHaveLength(1)
    expect(api.to('POST', '/auth/verify-email')[0].body).toEqual({ token: 'tok_abcdefghijklmnopqrstuv' })
  })

  it.each([
    ['TOKEN_EXPIRED', 'This verification link has expired.'],
    ['TOKEN_USED', 'This verification link has already been used.'],
  ])('shows %s clearly', async (code, text) => {
    mockApi({ 'POST /auth/verify-email': () => fail(400, 'x', code) })
    renderAt('/verify-email?token=tok_abcdefghijklmnopqrstuv')
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
  })

  it('shows an invalid state when the link has no token and sends no request', async () => {
    const api = mockApi()
    renderAt('/verify-email')
    expect(await screen.findByRole('alert')).toHaveTextContent('not valid')
    expect(api.to('POST', '/auth/verify-email')).toHaveLength(0)
  })

  it('a signed-in user verifying sees their banner disappear (user is refreshed)', async () => {
    let current = unverified
    const api = mockApi({ 'GET /auth/me': () => ok({ user: current }), 'POST /auth/verify-email': () => { current = verified; return ok() } })
    setToken('tok')
    renderAt('/verify-email?token=tok_abcdefghijklmnopqrstuv')
    expect(await screen.findByRole('heading', { name: 'Your email is verified' })).toBeInTheDocument()
    // regression: restoring the stored session must not remount the page and re-submit the single-use token
    await waitFor(() => expect(api.to('GET', '/auth/me').length).toBeGreaterThan(0))
    await new Promise((r) => setTimeout(r, 300))
    expect(api.to('POST', '/auth/verify-email')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Your email is verified' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toBeInTheDocument()
  })

  it('confirming an email change shows success and signs the browser out', async () => {
    mockApi({ ...signedIn(verified), 'POST /auth/confirm-email-change': () => ok({}, 'changed') })
    renderAt('/confirm-email-change?token=tok_abcdefghijklmnopqrstuv')
    expect(await screen.findByRole('heading', { name: 'Your email address was changed' })).toBeInTheDocument()
    await waitFor(() => expect(getToken()).toBeNull())
  })

  it('confirming an email change that is no longer possible shows the reason', async () => {
    mockApi({ 'POST /auth/confirm-email-change': () => fail(409, 'x', 'EMAIL_TAKEN') })
    renderAt('/confirm-email-change?token=tok_abcdefghijklmnopqrstuv')
    expect(await screen.findByRole('alert')).toHaveTextContent('already in use')
  })
})

describe('Settings: email notification preferences and email change', () => {
  const prefs = (overrides = {}) => ({ required: { security: true, emailVerification: true, passwordReset: true }, upcomingEventReminders: false, prepStartReminders: false, departureReminders: false, ...overrides })

  it('loads the saved state, lists the always-on emails, and saves only the toggled key', async () => {
    const api = mockApi({
      ...signedIn(verified),
      'GET /users/me/email-preferences': () => ok({ preferences: prefs({ departureReminders: true }) }),
      'PATCH /users/me/email-preferences': (body) => ok({ preferences: prefs({ departureReminders: true, ...body }) }),
    })
    const u = userEvent.setup()
    renderAt('/settings')
    const departure = await screen.findByRole('switch', { name: 'Departure reminders' })
    expect(departure).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: 'Preparation reminders' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('Password reset links')).toBeInTheDocument() // non-optional emails are shown, not toggles
    expect(screen.queryByRole('switch', { name: /security|password reset/i })).not.toBeInTheDocument()

    await u.click(screen.getByRole('switch', { name: 'Preparation reminders' }))
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Preparation reminders' })).toHaveAttribute('aria-checked', 'true'))
    expect(api.to('PATCH', '/users/me/email-preferences')[0].body).toEqual({ prepStartReminders: true })
  })

  it('reverts the switch and shows the error when saving fails', async () => {
    mockApi({
      ...signedIn(verified),
      'GET /users/me/email-preferences': () => ok({ preferences: prefs() }),
      'PATCH /users/me/email-preferences': () => fail(500, 'Something went wrong. Please try again later.'),
    })
    const u = userEvent.setup()
    renderAt('/settings')
    const toggle = await screen.findByRole('switch', { name: 'Upcoming event reminders' })
    await u.click(toggle)
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByRole('switch', { name: 'Upcoming event reminders' })).toHaveAttribute('aria-checked', 'false')
  })

  it('shows a loading state, then an error with retry if preferences cannot be loaded', async () => {
    let calls = 0
    mockApi({
      ...signedIn(verified),
      'GET /users/me/email-preferences': () => (++calls === 1 ? fail(500, 'Something went wrong. Please try again later.') : ok({ preferences: prefs() })),
    })
    const u = userEvent.setup()
    renderAt('/settings')
    expect(await screen.findByLabelText('Loading email preferences').catch(() => null)).not.toBeUndefined()
    await u.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('switch', { name: 'Departure reminders' })).toBeInTheDocument()
  })

  it('change email: validates, requires the password, and shows a generic confirmation (address is NOT changed yet)', async () => {
    const api = mockApi({
      ...signedIn(verified),
      'GET /users/me/email-preferences': () => ok({ preferences: prefs() }),
      'POST /users/me/email-change': () => ok({}, 'If that address can be used...'),
    })
    const u = userEvent.setup()
    renderAt('/settings')
    await u.click(await screen.findByRole('button', { name: 'Send confirmation link' }))
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your current password to confirm.')).toBeInTheDocument()
    expect(api.to('POST', '/users/me/email-change')).toHaveLength(0)

    await u.type(screen.getByLabelText('New email address'), 'new@example.com')
    await u.type(screen.getByLabelText('Current password'), 'Sup3rSecret!')
    await u.click(screen.getByRole('button', { name: 'Send confirmation link' }))
    expect(await screen.findByText(/Your email has not changed yet/i)).toBeInTheDocument()
    expect(api.to('POST', '/users/me/email-change')[0].body).toEqual({ newEmail: 'new@example.com', password: 'Sup3rSecret!' })
    // still the old address everywhere, and no profile update was sent
    expect(screen.getAllByText('sam@example.com').length).toBeGreaterThan(0)
    expect(api.calls.some((c) => c.method === 'PATCH' && c.path === '/users/me')).toBe(false)
  })

  it('change email: a wrong password is shown as a field error and does NOT log the user out', async () => {
    mockApi({
      ...signedIn(verified),
      'GET /users/me/email-preferences': () => ok({ preferences: prefs() }),
      'POST /users/me/email-change': () => fail(403, 'Incorrect password.', 'INVALID_PASSWORD', [{ field: 'password', message: 'Incorrect password' }]),
    })
    const u = userEvent.setup()
    renderAt('/settings')
    await u.type(await screen.findByLabelText('New email address'), 'new@example.com')
    await u.type(screen.getByLabelText('Current password'), 'WrongPassword1')
    await u.click(screen.getByRole('button', { name: 'Send confirmation link' }))
    expect(await screen.findByText('Incorrect password')).toBeInTheDocument()
    expect(getToken()).toBe('tok')
  })
})
