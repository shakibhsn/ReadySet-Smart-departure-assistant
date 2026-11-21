import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/apiClient'
import { createMemoryBackend, createOfflineStore } from '@/lib/offline/offlineStore'
import { offlineStore as appStore } from '@/lib/offline/offlineStore'
import { setOfflineUser } from '@/lib/offline/offlineUser'
import { flushQueue } from '@/lib/offline/syncQueue'
import { getChecklist, setChecklistItemDone } from '@/services/checklistApi'
import { setToken } from '@/lib/tokenStorage'

const iso = (n) => new Date(Date.UTC(2030, 4, 10, 0, 0, n)).toISOString()
const item = (id, done = false) => ({ id, eventId: 'e1', text: id, group: 'Essentials', done, completedAt: null, position: 0, createdAt: iso(0), updatedAt: iso(1) })
const checklist = (items) => ({ items, progress: { total: items.length, done: items.filter((i) => i.done).length } })

describe('offline store: per-user and private', () => {
  let store
  beforeEach(() => {
    store = createOfflineStore(createMemoryBackend())
  })

  it('returns data only for the user who saved it', async () => {
    await store.saveEvents('u1', [{ id: 'e1' }])
    await store.saveChecklist('u1', 'e1', checklist([item('a')]))
    expect((await store.loadEvents('u1')).events).toHaveLength(1)
    expect(await store.loadEvents('u2')).toBeNull()
    expect(await store.loadChecklist('u2', 'e1')).toBeNull()
  })

  it('never stores a token: only what it is given', async () => {
    await store.saveSession({ id: 'u1', name: 'A', email: 'a@x.test' })
    expect(JSON.stringify(await store.loadSession())).not.toMatch(/token|password/i)
  })

  it("signing in as another user purges every record of the previous user", async () => {
    await store.saveSession({ id: 'u1', name: 'A' })
    await store.saveEvents('u1', [{ id: 'e1' }])
    await store.saveChecklist('u1', 'e1', checklist([item('a')]))
    await store.enqueueCompletion({ opId: 'o1', userId: 'u1', eventId: 'e1', itemId: 'a', done: true, baseUpdatedAt: iso(1) })
    await store.purgeOtherUsers('u2')
    expect(await store.loadEvents('u1')).toBeNull()
    expect(await store.loadChecklist('u1', 'e1')).toBeNull()
    expect(await store.listQueue('u1')).toEqual([])
    expect(await store.loadSession()).toBeNull()
  })

  it('purge keeps the current user, and clearAll (logout) removes everything', async () => {
    await store.saveEvents('u1', [{ id: 'e1' }])
    await store.purgeOtherUsers('u1')
    expect(await store.loadEvents('u1')).not.toBeNull()
    await store.clearAll()
    expect(await store.loadEvents('u1')).toBeNull()
  })

  it('a newer tick of the same item replaces the older one but keeps the oldest base version', async () => {
    await store.enqueueCompletion({ opId: 'o1', userId: 'u1', eventId: 'e1', itemId: 'a', done: true, baseUpdatedAt: iso(1), createdAt: iso(10) })
    await store.enqueueCompletion({ opId: 'o2', userId: 'u1', eventId: 'e1', itemId: 'a', done: false, baseUpdatedAt: iso(5), createdAt: iso(20) })
    const q = await store.listQueue('u1')
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ opId: 'o2', done: false, baseUpdatedAt: iso(1) })
  })

  it('a broken storage backend never throws into the app', async () => {
    const broken = createOfflineStore({ kind: 'broken', get: async () => { throw new Error('x') }, put: async () => { throw new Error('x') }, del: async () => { throw new Error('x') }, all: async () => { throw new Error('x') }, clear: async () => { throw new Error('x') } })
    await expect(broken.saveEvents('u1', [])).resolves.toBeUndefined()
    await expect(broken.loadEvents('u1')).resolves.toBeNull()
    await expect(broken.listQueue('u1')).resolves.toEqual([])
    await expect(broken.enqueueCompletion({ opId: 'o', userId: 'u1', itemId: 'a', done: true })).resolves.toBeNull()
  })
})

describe('sync queue', () => {
  let store
  const queue = (op) => store.enqueueCompletion({ userId: 'u1', eventId: 'e1', baseUpdatedAt: iso(1), createdAt: iso(Number(op.opId.slice(1))), ...op })
  beforeEach(() => {
    store = createOfflineStore(createMemoryBackend())
  })

  it('replays oldest first, removes each op after the server accepted it, and reports the server version', async () => {
    await queue({ opId: 'o1', itemId: 'a', done: true })
    await queue({ opId: 'o2', itemId: 'b', done: true })
    const calls = []
    const seen = []
    const result = await flushQueue({ store, userId: 'u1', send: async (e, i, done, base) => { calls.push([i, done, base]); return item(i, done) }, onItem: (e, it) => seen.push(it.id) })
    expect(calls).toEqual([['a', true, iso(1)], ['b', true, iso(1)]])
    expect(result).toMatchObject({ synced: 2, remaining: 0, stopped: null })
    expect(seen).toEqual(['a', 'b'])
    expect(await store.listQueue('u1')).toEqual([])
  })

  it('never sends another user\'s operations', async () => {
    await store.enqueueCompletion({ opId: 'o1', userId: 'someone-else', eventId: 'e1', itemId: 'a', done: true })
    const send = vi.fn()
    await flushQueue({ store, userId: 'u1', send })
    expect(send).not.toHaveBeenCalled()
    expect(await store.listQueue('someone-else')).toHaveLength(1)
  })

  it('two flushes at once share one run: nothing is sent twice', async () => {
    await queue({ opId: 'o1', itemId: 'a', done: true })
    const send = vi.fn(async (e, i, d) => item(i, d))
    const [a, b] = await Promise.all([flushQueue({ store, userId: 'u1', send }), flushQueue({ store, userId: 'u1', send })])
    expect(send).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  it('a network failure stops the run and keeps the rest for later', async () => {
    await queue({ opId: 'o1', itemId: 'a', done: true })
    await queue({ opId: 'o2', itemId: 'b', done: true })
    const send = vi.fn(async () => { throw new ApiError('offline', { isNetworkError: true }) })
    const result = await flushQueue({ store, userId: 'u1', send })
    expect(send).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ synced: 0, remaining: 2, stopped: 'network' })
    expect(await store.listQueue('u1')).toHaveLength(2)
  })

  it('an expired session stops the run and keeps the queue (only replayed under the same login)', async () => {
    await queue({ opId: 'o1', itemId: 'a', done: true })
    const result = await flushQueue({ store, userId: 'u1', send: async () => { throw new ApiError('no', { status: 401 }) } })
    expect(result.stopped).toBe('auth')
    expect(await store.listQueue('u1')).toHaveLength(1)
  })

  it('a conflict is not forced through: the op is dropped and the user is told; later ops still run', async () => {
    await queue({ opId: 'o1', itemId: 'a', done: true })
    await queue({ opId: 'o2', itemId: 'b', done: true })
    const send = async (e, i) => {
      if (i === 'a') throw new ApiError('changed', { status: 409, code: 'SYNC_CONFLICT' })
      return item(i, true)
    }
    const result = await flushQueue({ store, userId: 'u1', send })
    expect(result.synced).toBe(1)
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]).toMatchObject({ itemId: 'a', reason: 'conflict' })
    expect(await store.listQueue('u1')).toEqual([])
  })

  it('an item that no longer exists is dropped with an explanation', async () => {
    await queue({ opId: 'o1', itemId: 'a', done: true })
    const result = await flushQueue({ store, userId: 'u1', send: async () => { throw new ApiError('gone', { status: 404 }) } })
    expect(result.conflicts[0]).toMatchObject({ reason: 'gone' })
    expect(await store.listQueue('u1')).toEqual([])
  })
})

describe('checklist API offline fallback', () => {
  afterEach(() => {
    setOfflineUser(null)
    vi.unstubAllGlobals()
  })
  const offlineFetch = () => vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

  it('serves the saved copy only when the server cannot be reached, labelled offline', async () => {
    setOfflineUser('u-off')
    await appStore.saveChecklist('u-off', 'e1', checklist([item('a')]))
    offlineFetch()
    const data = await getChecklist('e1')
    expect(data).toMatchObject({ offline: true })
    expect(data.items[0].id).toBe('a')
  })

  it('does not fall back for another user, or without a saved copy', async () => {
    await appStore.saveChecklist('u-off', 'e1', checklist([item('a')]))
    setOfflineUser('u-other')
    offlineFetch()
    await expect(getChecklist('e1')).rejects.toMatchObject({ isNetworkError: true })
    setOfflineUser(null)
    await expect(getChecklist('e1')).rejects.toMatchObject({ isNetworkError: true })
  })

  it('a real server error (404) is never hidden behind old data', async () => {
    setOfflineUser('u-off')
    await appStore.saveChecklist('u-off', 'e1', checklist([item('a')]))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, message: 'Event not found' }), { status: 404, headers: { 'content-type': 'application/json' } })))
    setToken('t')
    await expect(getChecklist('e1')).rejects.toMatchObject({ status: 404 })
  })

  it('a tick made offline is saved on the device, queued once, and keeps the server version as its base', async () => {
    setOfflineUser('u-tick')
    await appStore.saveChecklist('u-tick', 'e1', checklist([item('a'), item('b')]))
    offlineFetch()
    const saved = await setChecklistItemDone('e1', 'a', true)
    expect(saved).toMatchObject({ done: true, pendingSync: true })
    await setChecklistItemDone('e1', 'a', false) // changed their mind
    const queue = await appStore.listQueue('u-tick')
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ itemId: 'a', done: false, baseUpdatedAt: iso(1) })
    const copy = await appStore.loadChecklist('u-tick', 'e1')
    expect(copy.items.find((i) => i.id === 'a').done).toBe(false)
    expect(copy.items.find((i) => i.id === 'a').updatedAt).toBe(iso(1))
    await appStore.clearAll()
  })

  it('cannot change an item that was never saved for offline use', async () => {
    setOfflineUser('u-none')
    offlineFetch()
    await expect(setChecklistItemDone('e1', 'zzz', true)).rejects.toMatchObject({ isNetworkError: true })
  })
})
