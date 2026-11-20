import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '@/routes'
import { AuthProvider } from '@/components/common/AuthProvider'
import { NotificationsProvider } from '@/components/common/NotificationsProvider'
import { NotificationPreferencesCard } from '@/components/settings/NotificationPreferencesCard'
import { setToken } from '@/lib/tokenStorage'
import { createFakeApi } from './fakeApi'

const pref = { defaultPreparationMinutes: 30, defaultArrivalBufferMinutes: 10, preferredTravelMode: 'manual', timezone: 'Asia/Dhaka' }
const alice = { id: 'u-a', name: 'Alice Anders', email: 'a@example.com', emailVerified: true, preference: pref }
const bob = { id: 'u-b', name: 'Bob Brown', email: 'b@example.com', emailVerified: true, preference: pref }
const users = { 'a@example.com': { user: alice, token: 'token-a' }, 'b@example.com': { user: bob, token: 'token-b' } }

const NOTES = [
  { title: 'Time to leave', body: 'Class: leave now.', category: 'departure', read: false },
  { title: 'Get ready soon', body: 'Class: start preparing in 10 minutes.', category: 'preparation', read: false },
  { title: 'Class starts soon', body: 'Starts at 10:00 AM.', category: 'event', read: true },
]

function setup({ path = '/notifications', token = 'token-a', notes = NOTES, mutate } = {}) {
  const api = createFakeApi({ users })
  if (notes.length) api.seedNotifications('token-a', notes)
  api.seedNotifications('token-b', [{ title: 'Bob private', body: 'secret' }])
  mutate?.(api)
  api.install()
  setToken(token)
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  )
  return api
}

// The preferences card on its own (the full Settings page is covered by its own tests).
function setupCard({ mutate } = {}) {
  const api = createFakeApi({ users })
  api.seedNotifications('token-a', NOTES)
  mutate?.(api)
  api.install()
  setToken('token-a')
  render(
    <NotificationsProvider>
      <NotificationPreferencesCard />
    </NotificationsProvider>,
  )
  return api
}

const stubNotification = ({ permission = 'default', request = 'granted' } = {}) => {
  const ctor = vi.fn()
  ctor.permission = permission
  ctor.requestPermission = vi.fn(async () => {
    ctor.permission = request
    return request
  })
  vi.stubGlobal('Notification', ctor)
  return ctor
}

afterEach(() => vi.unstubAllGlobals())

describe('Notifications page (API-backed)', () => {
  it('lists the history with read/unread distinction and the unread count', async () => {
    setup()
    expect(await screen.findByText('Time to leave')).toBeInTheDocument()
    expect(screen.getByText('You have 2 unread notifications.')).toBeInTheDocument()
    expect(screen.getByText('Class starts soon')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Unread')).toHaveLength(2)
    expect(screen.queryByText('Bob private')).not.toBeInTheDocument() // never another user's data
  })

  it('marks one as read, then all as read', async () => {
    const user = userEvent.setup()
    const api = setup()
    await screen.findByText('Time to leave')
    await user.click(screen.getByRole('button', { name: 'Mark "Time to leave" as read' }))
    expect(await screen.findByText('You have 1 unread notification.')).toBeInTheDocument()
    expect(api.notifications('token-a').filter((n) => !n.read)).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: /Mark all as read/ }))
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument()
    expect(api.notifications('token-a').every((n) => n.read)).toBe(true)
    expect(api.notifications('token-b')[0].read).toBe(false)
  })

  it('deletes a notification', async () => {
    const user = userEvent.setup()
    const api = setup()
    await screen.findByText('Get ready soon')
    await user.click(screen.getByRole('button', { name: 'Delete "Get ready soon"' }))
    await waitFor(() => expect(screen.queryByText('Get ready soon')).not.toBeInTheDocument())
    expect(api.notifications('token-a')).toHaveLength(2)
  })

  it('filters by status and category', async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText('Time to leave')
    await user.click(screen.getByRole('radio', { name: /^Read \(1\)/ }))
    expect(screen.getByText('Class starts soon')).toBeInTheDocument()
    expect(screen.queryByText('Time to leave')).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /^All \(3\)/ }))
    await user.click(screen.getByRole('button', { name: 'Departure' }))
    expect(screen.getByText('Time to leave')).toBeInTheDocument()
    expect(screen.queryByText('Get ready soon')).not.toBeInTheDocument()
  })

  it('shows an empty state when there are no notifications', async () => {
    setup({ notes: [] })
    expect(await screen.findByText('No notifications yet')).toBeInTheDocument()
  })

  it('shows an error with a retry when notifications cannot be loaded', async () => {
    const user = userEvent.setup()
    let down = true
    setup({ mutate: (api) => api.override((method, path) => (down && method === 'GET' && path === '/notifications' ? api.respond(500, { success: false, message: 'Notifications are down', errors: [] }) : undefined)) })
    expect(await screen.findByText(/Notifications are down/)).toBeInTheDocument()
    down = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Time to leave')).toBeInTheDocument()
  })
})

describe('Notification bell', () => {
  it('shows the unread count in the navbar and a panel with the latest notifications', async () => {
    const user = userEvent.setup()
    setup({ path: '/' })
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    await user.click(bell)
    const panel = await screen.findByRole('dialog', { name: 'Notifications' })
    expect(within(panel).getByText('Time to leave')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'View all notifications' })).toHaveAttribute('href', '/notifications')
  })

  it('reading from the panel lowers the count; "Mark all read" clears it', async () => {
    const user = userEvent.setup()
    const api = setup({ path: '/' })
    await user.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Time to leave/ }))
    expect(await screen.findByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Mark all read/ }))
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    expect(api.notifications('token-a').every((n) => n.read)).toBe(true)
  })

  it('an empty bell panel says you are caught up', async () => {
    const user = userEvent.setup()
    setup({ path: '/', notes: [] })
    await user.click(await screen.findByRole('button', { name: 'Notifications' }))
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument()
  })

  it("never shows another user's notifications", async () => {
    setup({ path: '/', token: 'token-b' })
    expect(await screen.findByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument()
  })
})

describe('Notification preferences and browser notifications', () => {
  it('loads saved preferences and saves a toggle and the lead time to the server', async () => {
    const user = userEvent.setup()
    const api = setupCard()
    const departure = await screen.findByRole('switch', { name: 'Departure reminders' })
    expect(departure).toBeChecked()
    await user.click(departure)
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PATCH' && c.path === '/users/me/notification-preferences' && c.body.departure === false)).toBe(true))
    expect(screen.getByRole('switch', { name: 'Departure reminders' })).not.toBeChecked()
    await user.selectOptions(screen.getByLabelText(/Approaching/), '15')
    await waitFor(() => expect(api.calls.some((c) => c.body?.leadMinutes === 15)).toBe(true))
  })

  it('reverts the switch and shows the error when saving fails', async () => {
    const user = userEvent.setup()
    setupCard({ mutate: (api) => api.override((method, path) => (method === 'PATCH' && path === '/users/me/notification-preferences' ? api.respond(500, { success: false, message: 'Could not save', errors: [] }) : undefined)) })
    const sw = await screen.findByRole('switch', { name: 'Checklist reminders' })
    await user.click(sw)
    expect(await screen.findByText('Could not save')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Checklist reminders' })).toBeChecked()
  })

  it('NEVER asks for browser permission on load or just by visiting Settings; only after the button is clicked', async () => {
    const user = userEvent.setup()
    const ctor = stubNotification({ permission: 'default', request: 'granted' })
    const api = setupCard()
    await screen.findByRole('button', { name: 'Enable browser notifications' })
    expect(ctor.requestPermission).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Enable browser notifications' }))
    expect(ctor.requestPermission).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('switch', { name: 'Browser notifications' })).toBeChecked()
    expect(api.calls.some((c) => c.method === 'PATCH' && c.body?.browser === true)).toBe(true)
  })

  it('permission denied: explains it and in-app notifications keep working', async () => {
    const user = userEvent.setup()
    stubNotification({ permission: 'default', request: 'denied' })
    setupCard()
    await user.click(await screen.findByRole('button', { name: 'Enable browser notifications' }))
    expect(await screen.findByText(/blocked for ReadySet/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enable browser notifications' })).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Departure reminders' })).toBeInTheDocument()
  })

  it('already denied in the browser: no request button is offered', async () => {
    const ctor = stubNotification({ permission: 'denied' })
    setupCard()
    expect(await screen.findByText(/blocked for ReadySet/)).toBeInTheDocument()
    expect(ctor.requestPermission).not.toHaveBeenCalled()
  })

  it('a browser without the Notifications API still works (in-app only)', async () => {
    vi.stubGlobal('Notification', undefined)
    setupCard()
    expect(await screen.findByText(/does not support notifications/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enable browser notifications' })).not.toBeInTheDocument()
  })

  it('shows a browser alert only for NEW unread notifications (never old ones on load) when opted in and permitted', async () => {
    const user = userEvent.setup()
    const ctor = stubNotification({ permission: 'granted' })
    const api = setup({ path: '/', mutate: (a) => a.setNotificationPrefs('token-a', { browser: true }) })
    await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    expect(ctor).not.toHaveBeenCalled() // existing notifications never pop up
    api.seedNotifications('token-a', [{ title: 'Brand new', body: 'Fresh' }])
    await user.click(screen.getByRole('button', { name: /^Notifications/ })) // opening the panel refreshes
    await screen.findAllByText('Brand new')
    expect(ctor).toHaveBeenCalledTimes(1)
    expect(ctor).toHaveBeenCalledWith('Brand new', expect.objectContaining({ body: 'Fresh' }))
    await user.click(screen.getByRole('button', { name: /^Notifications/ })) // close
    await user.click(screen.getByRole('button', { name: /^Notifications/ })) // open again: refresh, no repeat alert
    expect(ctor).toHaveBeenCalledTimes(1)
  })

  it('no browser alert when the user has not opted in, even if permission was granted earlier', async () => {
    const user = userEvent.setup()
    const ctor = stubNotification({ permission: 'granted' })
    const api = setup({ path: '/' })
    await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    api.seedNotifications('token-a', [{ title: 'Brand new', body: 'Fresh' }])
    await user.click(screen.getByRole('button', { name: /^Notifications/ }))
    await screen.findAllByText('Brand new')
    expect(ctor).not.toHaveBeenCalled()
  })
})
