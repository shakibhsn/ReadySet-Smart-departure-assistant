import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '@/routes'
import { AuthProvider } from '@/components/common/AuthProvider'
import { AppStateProvider } from '@/components/common/AppStateProvider'

const user = { id: 'u1', name: 'Sam Rivera', email: 'sam@example.com', preference: null }
const KEY = 'readyset.token'

function stubLogin() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: { user, token: 'jwt-abc' } }) }),
    ),
  )
}

async function loginWith({ remember }) {
  stubLogin()
  const u = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <AppStateProvider>
          <AppRoutes />
        </AppStateProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
  const box = screen.getByRole('checkbox', { name: /remember me/i })
  if (remember) await u.click(box)
  else expect(box).not.toBeChecked()
  await u.type(screen.getByLabelText('Email'), 'sam@example.com')
  await u.type(screen.getByLabelText('Password'), 'Sup3rSecret!')
  await u.click(screen.getByRole('button', { name: 'Log in' }))
  await screen.findByRole('heading', { name: /good (morning|afternoon|evening), Sam/i })
}

describe('"Remember me" controls where the token is stored', () => {
  it('is unchecked by default and stores the token in sessionStorage only', async () => {
    await loginWith({ remember: false })
    expect(window.sessionStorage.getItem(KEY)).toBe('jwt-abc')
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('stores the token in localStorage only when ticked', async () => {
    await loginWith({ remember: true })
    expect(window.localStorage.getItem(KEY)).toBe('jwt-abc')
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
  })
})
