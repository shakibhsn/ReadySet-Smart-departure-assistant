import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '@/routes'
import { AuthProvider } from '@/components/common/AuthProvider'
import { UserScopedAppState } from '@/components/common/UserScopedAppState'

const users = {
  'a@example.com': { id: 'user-a', name: 'Alice Anders', email: 'a@example.com', preference: null },
  'b@example.com': { id: 'user-b', name: 'Bob Brown', email: 'b@example.com', preference: null },
}
const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })

function stubApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url, init) => {
      if (url.endsWith('/auth/login')) {
        const user = users[JSON.parse(init.body).email]
        return ok({ success: true, data: { user, token: `token-${user.id}` } })
      }
      return ok({ success: true, message: 'ok', data: {} }) // logout
    }),
  )
}

describe('app state is scoped to the signed-in user', () => {
  it("does not carry one user's changes over to the next user in the same tab", async () => {
    stubApi()
    const u = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <UserScopedAppState>
            <AppRoutes />
          </UserScopedAppState>
        </AuthProvider>
      </MemoryRouter>,
    )

    const login = async (email) => {
      await u.type(screen.getByLabelText('Email'), email)
      await u.type(screen.getByLabelText('Password'), 'Sup3rSecret!')
      await u.click(screen.getByRole('button', { name: 'Log in' }))
      await screen.findByRole('heading', { name: /good (morning|afternoon|evening)/i })
    }
    // The desktop sidebar is the first "Main" navigation; the mobile drawer and navbar repeat the link.
    const sidebar = () => within(screen.getAllByRole('navigation', { name: 'Main' })[0])
    const unreadBadge = () => sidebar().queryByText(/^\d+$/)

    // User A logs in and marks every notification as read.
    await login('a@example.com')
    expect(unreadBadge()).toHaveTextContent('3')
    await u.click(sidebar().getByRole('link', { name: /Notifications/ }))
    await u.click(await screen.findByRole('button', { name: /mark all as read/i }))
    expect(unreadBadge()).toBeNull()

    // A logs out, B logs in: B must see fresh state, not A's "all read".
    await u.click(screen.getAllByRole('button', { name: /log out/i })[0])
    await screen.findByRole('heading', { name: 'Welcome back' })
    await login('b@example.com')
    expect(unreadBadge()).toHaveTextContent('3')
  })
})
