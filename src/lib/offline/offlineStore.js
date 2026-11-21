// OFFLINE STORE: a small per-user copy of data that is safe to keep on the device, plus the queue of checklist
// ticks made offline.
//
// SECURITY MODEL
//  - Lives in IndexedDB of THIS browser profile (same trust level as the existing token storage). It is never put in
//    a service-worker cache, a shared cache or any URL, and the authentication token is NEVER stored here.
//  - Every record carries its userId and is only read back for that user.
//  - Explicit logout clears everything; signing in as a different user purges every other user's records.
//  - Only: the user's profile as the API returned it (no password or token) so the app can open offline, upcoming events, checklists and the
//    queued checklist ticks. Notes, weather, preparation logs and settings are never copied.

const DB_NAME = 'readyset-offline'
const STORES = ['session', 'events', 'checklists', 'queue']

/** In-memory backend: used by tests, and when IndexedDB is unavailable (private mode): data then simply does not survive a reload. */
export function createMemoryBackend() {
  const data = Object.fromEntries(STORES.map((s) => [s, new Map()]))
  return {
    kind: 'memory',
    get: async (store, key) => structuredClone(data[store].get(key) ?? null),
    put: async (store, key, value) => void data[store].set(key, structuredClone(value)),
    del: async (store, key) => void data[store].delete(key),
    all: async (store) => [...data[store].values()].map((v) => structuredClone(v)),
    clear: async () => STORES.forEach((s) => data[s].clear()),
  }
}

const wrap = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

export function createIdbBackend(factory = globalThis.indexedDB) {
  let opening = null
  const open = () => {
    opening ??= new Promise((resolve, reject) => {
      const req = factory.open(DB_NAME, 1)
      req.onupgradeneeded = () => STORES.forEach((s) => req.result.createObjectStore(s))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    return opening
  }
  const run = async (store, mode, fn) => {
    const db = await open()
    const tx = db.transaction(store, mode)
    const result = await fn(tx.objectStore(store))
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    return result
  }
  return {
    kind: 'indexeddb',
    get: (store, key) => run(store, 'readonly', (s) => wrap(s.get(key))).then((v) => v ?? null),
    put: (store, key, value) => run(store, 'readwrite', (s) => wrap(s.put(value, key))).then(() => undefined),
    del: (store, key) => run(store, 'readwrite', (s) => wrap(s.delete(key))).then(() => undefined),
    all: (store) => run(store, 'readonly', (s) => wrap(s.getAll())),
    clear: async () => {
      const db = await open()
      const tx = db.transaction(STORES, 'readwrite')
      STORES.forEach((s) => tx.objectStore(s).clear())
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
    },
  }
}

const key = (userId, id) => `${userId}:${id}`

/** Every method swallows storage failures (quota, blocked storage): offline support is a bonus and must never break the app. */
export function createOfflineStore(backend) {
  const guard = (fn, fallback) => async (...args) => {
    try {
      return await fn(...args)
    } catch {
      return fallback
    }
  }

  return {
    backendKind: backend.kind,

    saveSession: guard((user) => backend.put('session', 'current', { userId: user.id, user, savedAt: new Date().toISOString() }), undefined),
    loadSession: guard(() => backend.get('session', 'current'), null),

    saveEvents: guard((userId, events) => backend.put('events', userId, { userId, events, savedAt: new Date().toISOString() }), undefined),
    loadEvents: guard(async (userId) => {
      const rec = await backend.get('events', userId)
      return rec && rec.userId === userId ? rec : null
    }, null),

    saveChecklist: guard((userId, eventId, data) => backend.put('checklists', key(userId, eventId), { userId, eventId, items: data.items, progress: data.progress, savedAt: new Date().toISOString() }), undefined),
    loadChecklist: guard(async (userId, eventId) => {
      const rec = await backend.get('checklists', key(userId, eventId))
      return rec && rec.userId === userId ? rec : null
    }, null),

    /**
     * Queue one tick. A newer tick of the same item REPLACES the older one (only the last intention matters) but keeps
     * the OLDEST baseUpdatedAt, so a conflict is still judged against what the user actually saw.
     */
    async enqueueCompletion(op) {
      try {
        const all = (await backend.all('queue')).filter((o) => o.userId === op.userId && o.itemId === op.itemId)
        const base = all.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.baseUpdatedAt ?? op.baseUpdatedAt ?? null
        for (const old of all) await backend.del('queue', old.opId)
        const record = { opId: op.opId, userId: op.userId, eventId: op.eventId, itemId: op.itemId, done: Boolean(op.done), baseUpdatedAt: base, createdAt: op.createdAt ?? new Date().toISOString() }
        await backend.put('queue', record.opId, record)
        return record
      } catch {
        return null
      }
    },
    listQueue: guard(async (userId) => (await backend.all('queue')).filter((o) => o.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), []),
    removeOp: guard((opId) => backend.del('queue', opId), undefined),

    /** Different user signed in on this device: nothing of the previous user may remain. */
    purgeOtherUsers: guard(async (userId) => {
      for (const store of ['events', 'checklists', 'queue']) {
        for (const rec of await backend.all(store)) {
          if (rec.userId !== userId) await backend.del(store, store === 'events' ? rec.userId : store === 'queue' ? rec.opId : key(rec.userId, rec.eventId))
        }
      }
      const session = await backend.get('session', 'current')
      if (session && session.userId !== userId) await backend.del('session', 'current')
    }, undefined),

    clearAll: guard(() => backend.clear(), undefined),
  }
}

const pickBackend = () => {
  try {
    if (typeof indexedDB !== 'undefined' && indexedDB) return createIdbBackend()
  } catch {
    /* fall through */
  }
  return createMemoryBackend()
}

/** The app-wide store. */
export const offlineStore = createOfflineStore(pickBackend())
