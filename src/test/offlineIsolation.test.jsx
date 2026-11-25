import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { OfflineProvider } from '@/components/common/OfflineProvider'
import { EventsCacheContext } from '@/lib/eventsCacheContext'
import { AuthContext } from '@/lib/authContext'
import { offlineStore } from '@/lib/offline/offlineStore'
import { getOfflineUser } from '@/lib/offline/offlineUser'
import { getChecklist, setChecklistItemDoneOnline } from '@/services/checklistApi'
import { getUpcomingEvents } from '@/services/eventApi'

vi.mock('@/services/eventApi', () => ({ getUpcomingEvents: vi.fn() }))
vi.mock('@/services/checklistApi', () => ({ getChecklist: vi.fn(), setChecklistItemDoneOnline: vi.fn() }))

// Background offline work for one user must never touch the next user: the request token is global, so a stale refresh
// would otherwise fetch the NEW user's data and store it under the OLD user's key.
const tree = (user) => (
  <AuthContext.Provider value={{ user }}>
    <EventsCacheContext.Provider value={{ version: 0, invalidate: () => {} }}>
      <OfflineProvider key={user.id}>
        <span>app</span>
      </OfflineProvider>
    </EventsCacheContext.Provider>
  </AuthContext.Provider>
)
const A = { id: 'user-a', name: 'A', email: 'a@x.test' }
const B = { id: 'user-b', name: 'B', email: 'b@x.test' }
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 30)) })

beforeEach(async () => {
  vi.clearAllMocks()
  await offlineStore.clearAll()
})

describe('offline provider: user isolation', () => {
  it("a refresh that is still running when the user changes does NOT store the new user's events under the old user", async () => {
    let release
    getUpcomingEvents.mockImplementationOnce(() => new Promise((resolve) => { release = resolve })) // A's request is slow
    getUpcomingEvents.mockResolvedValue([{ id: 'b-event', title: "B's private event" }])
    getChecklist.mockResolvedValue({ items: [], progress: { total: 0, done: 0 } })

    const view = render(tree(A))
    await flush()
    expect(release).toBeTypeOf('function') // A's refresh is in flight
    view.rerender(tree(B)) // A signs out, B signs in
    await flush()
    await act(async () => release([{ id: 'b-event-as-seen-by-A-request', title: "B's private event" }])) // the stale request finishes now
    await flush()

    expect(await offlineStore.loadEvents('user-a')).toBeNull() // nothing was stored for A
    expect(JSON.stringify(await offlineStore.loadEvents('user-a'))).not.toContain('private')
  })

  it('the current user is not wiped when the previous provider cleans up, and is cleared on sign-out', async () => {
    getUpcomingEvents.mockResolvedValue([])
    const view = render(tree(A))
    await flush()
    expect(getOfflineUser()).toBe('user-a')
    view.rerender(tree(B))
    await flush()
    expect(getOfflineUser()).toBe('user-b') // A's cleanup must not clear B
    view.unmount()
    await flush()
    expect(getOfflineUser()).toBeNull()
  })

  it('a profile update (a new user object, same id) does not clear the current user', async () => {
    getUpcomingEvents.mockResolvedValue([])
    const view = render(tree(A))
    await flush()
    view.rerender(tree({ ...A, name: 'A renamed' }))
    await flush()
    expect(getOfflineUser()).toBe('user-a')
  })

  it("another user's queued changes are never sent with this user's login (signing in purges them, as documented)", async () => {
    await offlineStore.enqueueCompletion({ opId: 'op1', userId: 'user-a', eventId: 'e1', itemId: 'i1', done: true, baseUpdatedAt: '2030-01-01T00:00:00.000Z' })
    getUpcomingEvents.mockResolvedValue([])
    setChecklistItemDoneOnline.mockResolvedValue({ id: 'i1', done: true })
    const view = render(tree(B)) // B is signed in on a device that still held A's queue
    await flush()
    expect(setChecklistItemDoneOnline).not.toHaveBeenCalled() // never sent under B's token
    expect(await offlineStore.listQueue('user-a')).toEqual([]) // and nothing of A remains on the device
    view.unmount()
  })

  it("the user's own queued change is sent once when they are online", async () => {
    await offlineStore.enqueueCompletion({ opId: 'op1', userId: 'user-a', eventId: 'e1', itemId: 'i1', done: true, baseUpdatedAt: '2030-01-01T00:00:00.000Z' })
    getUpcomingEvents.mockResolvedValue([])
    getChecklist.mockResolvedValue({ items: [], progress: { total: 0, done: 0 } })
    setChecklistItemDoneOnline.mockResolvedValue({ id: 'i1', done: true, updatedAt: '2030-01-02T00:00:00.000Z' })
    render(tree(A))
    await flush()
    expect(setChecklistItemDoneOnline).toHaveBeenCalledTimes(1)
    expect(setChecklistItemDoneOnline).toHaveBeenCalledWith('e1', 'i1', true, '2030-01-01T00:00:00.000Z')
    expect(await offlineStore.listQueue('user-a')).toEqual([])
  })

  it("the signed-in user's own refresh still works (snapshot of their events)", async () => {
    getUpcomingEvents.mockResolvedValue([{ id: 'e1', title: 'Mine' }])
    getChecklist.mockResolvedValue({ items: [], progress: { total: 0, done: 0 } })
    render(tree(A))
    await flush()
    expect((await offlineStore.loadEvents('user-a')).events).toEqual([{ id: 'e1', title: 'Mine' }])
    expect(getChecklist).toHaveBeenCalledWith('e1')
  })
})
