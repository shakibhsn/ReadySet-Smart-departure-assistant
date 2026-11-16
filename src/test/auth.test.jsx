import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '@/routes'
import { AuthProvider } from '@/components/common/AuthProvider'
import { AppStateProvider } from '@/components/common/AppStateProvider'
import { getToken, setToken } from '@/lib/tokenStorage'

const user = {
  id: 'u1',
  name: 'Sam Rivera',
  email: 'sam@example.com',
  preference: { defaultPreparationMinutes: 30, defaultArrivalBufferMinutes: 10, preferredTravelMode: 'manual', timezone: 'Asia/Dhaka' },
}

const json = (status, body) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) })

/** Installs a fake fetch. `routes` maps "METHOD /path" to a handler returning a response. */
function mockApi(routes) {
  const fn = vi.fn((url, init = {}) => {
    const path = new URL(url).pathname.replace(/^\/api/, '')
    const handler = routes[`${init.method ?? 'GET'} ${path}`]
    if (!handler) return json(404, { success: false, message: 'Route not found', errors: [] })
    return handler(init)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const renderApp = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppStateProvider>
          <AppRoutes />
        </AppStateProvider>
      </AuthProvider>
    </MemoryRouter>,
  )

const lastBody = (fetchMock) => JSON.parse(fetchMock.mock.calls.at(-1)[1].body)

describe('protected routes', () => {
  it('redirects unauthenticated visitors to /login without calling the API', async () => {
    const fetchMock = mockApi({})
    renderApp('/settings')
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows a loading state (not protected content) while the session is verified, then the dashboard', async () => {
    setToken('valid-token')
    let release
    const gate = new Promise((r) => (release = r))
    const fetchMock = mockApi({ 'GET /auth/me': () => gate.then(() => json(200, { success: true, data: { user } })) })
    renderApp('/')

    expect(screen.getByRole('status')).toHaveTextContent(/checking your session/i)
    expect(screen.queryByText(/good (morning|afternoon|evening)/i)).not.toBeInTheDocument()

    release()
    expect(await screen.findByRole('heading', { name: /good (morning|afternoon|evening), Sam/i })).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer valid-token')
  })

  it('clears an invalid token and sends the user to /login', async () => {
    setToken('expired-token')
    mockApi({ 'GET /auth/me': () => json(401, { success: false, message: 'Invalid token', errors: [] }) })
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })

  it('redirects signed-in users away from /login', async () => {
    setToken('valid-token')
    mockApi({ 'GET /auth/me': () => json(200, { success: true, data: { user } }) })
    renderApp('/login')
    expect(await screen.findByRole('heading', { name: /good (morning|afternoon|evening), Sam/i })).toBeInTheDocument()
  })
})

describe('login form', () => {
  it('posts credentials to the backend, stores the token and opens the dashboard', async () => {
    const fetchMock = mockApi({
      'POST /auth/login': () => json(200, { success: true, message: 'Login successful', data: { user, token: 'jwt-123' } }),
    })
    const u = userEvent.setup()
    renderApp('/login')
    await u.type(screen.getByLabelText('Email'), 'sam@example.com')
    await u.type(screen.getByLabelText('Password'), 'Sup3rSecret!')
    await u.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('heading', { name: /good (morning|afternoon|evening), Sam/i })).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/login$/)
    expect(lastBody(fetchMock)).toEqual({ email: 'sam@example.com', password: 'Sup3rSecret!' })
    expect(getToken()).toBe('jwt-123')
  })

  it('shows the server message for invalid credentials and stays on the page', async () => {
    mockApi({ 'POST /auth/login': () => json(401, { success: false, message: 'Invalid email or password', errors: [] }) })
    const u = userEvent.setup()
    renderApp('/login')
    await u.type(screen.getByLabelText('Email'), 'sam@example.com')
    await u.type(screen.getByLabelText('Password'), 'wrong-password')
    await u.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
    expect(getToken()).toBeNull()
  })

  it('shows a network error when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    const u = userEvent.setup()
    renderApp('/login')
    await u.type(screen.getByLabelText('Email'), 'sam@example.com')
    await u.type(screen.getByLabelText('Password'), 'Sup3rSecret!')
    await u.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot reach the server/i)
  })

  it('validates locally before calling the API', async () => {
    const fetchMock = mockApi({})
    const u = userEvent.setup()
    renderApp('/login')
    await u.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('register form', () => {
  async function fillRegistration(u, email = 'sam@example.com') {
    await u.type(screen.getByLabelText('Full name'), 'Sam Rivera')
    await u.type(screen.getByLabelText('Email'), email)
    await u.type(screen.getByLabelText('Password'), 'Sup3rSecret!')
    await u.type(screen.getByLabelText('Confirm password'), 'Sup3rSecret!')
    await u.click(screen.getByRole('checkbox'))
    await u.click(screen.getByRole('button', { name: 'Create account' }))
  }

  it('posts the registration, shows the welcome message and opens the dashboard', async () => {
    const fetchMock = mockApi({
      'POST /auth/register': () => json(201, { success: true, message: 'Account created successfully', data: { user, token: 'jwt-new' } }),
    })
    const u = userEvent.setup()
    renderApp('/register')
    await fillRegistration(u)

    expect(await screen.findByText(/your account has been created/i)).toBeInTheDocument()
    expect(lastBody(fetchMock)).toEqual({
      name: 'Sam Rivera',
      email: 'sam@example.com',
      password: 'Sup3rSecret!',
      confirmPassword: 'Sup3rSecret!',
    })
    expect(getToken()).toBe('jwt-new')
  })

  it('shows the duplicate email error from the backend under the email field', async () => {
    mockApi({
      'POST /auth/register': () =>
        json(409, {
          success: false,
          message: 'An account with this email already exists',
          errors: [{ field: 'email', message: 'Email is already registered' }],
        }),
    })
    const u = userEvent.setup()
    renderApp('/register')
    await fillRegistration(u)
    expect(await screen.findByText('Email is already registered')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('logout', () => {
  it('ends the session, removes the token and returns to the login page', async () => {
    setToken('valid-token')
    const fetchMock = mockApi({
      'GET /auth/me': () => json(200, { success: true, data: { user } }),
      'POST /auth/logout': () => json(200, { success: true, message: 'Logged out', data: {} }),
    })
    const u = userEvent.setup()
    renderApp('/')
    await screen.findByRole('heading', { name: /good (morning|afternoon|evening), Sam/i })

    await u.click(screen.getAllByRole('button', { name: /log out/i })[0])
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    await waitFor(() => expect(getToken()).toBeNull())
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/auth/logout'))).toBe(true)
  })
})
