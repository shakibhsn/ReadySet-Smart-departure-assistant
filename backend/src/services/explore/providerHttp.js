// Shared plumbing for the free providers used by Weather & Explore (Open-Meteo, Overpass/OpenStreetMap):
// request timeouts, ONE failure type, and a small TTL cache that also shares in-flight requests so a burst of identical
// requests costs the provider a single call. Only search text / coordinates are ever sent: no user id, name or email.

export const TIMEOUT_MS = 5000

export class ProviderError extends Error {
  constructor(kind) {
    super(kind)
    this.kind = kind // 'timeout' | 'failed'
  }
}

const asProviderError = (err) => (err instanceof ProviderError ? err : new ProviderError(err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'timeout' : 'failed'))

export async function getJson(url, fetchFn, { timeoutMs = TIMEOUT_MS, init = {} } = {}) {
  let res
  try {
    res = await fetchFn(url, { ...init, headers: { Accept: 'application/json', ...init.headers }, signal: AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    throw asProviderError(err)
  }
  if (!res.ok) throw new ProviderError('failed')
  try {
    return await res.json()
  } catch {
    throw new ProviderError('failed')
  }
}

/** The shape every service returns when a provider is down: a normal 200 reply with a status, never a crash. */
export const unavailable = (err, extra = {}) => ({
  status: err?.kind === 'timeout' ? 'timeout' : 'provider_unavailable',
  message: err?.kind === 'timeout' ? 'The data provider took too long to answer. Please try again.' : 'The data provider is not responding right now. Please try again shortly.',
  ...extra,
})

/** TTL cache with a size cap. `peek` returns an entry even if expired (for stale fallbacks); `memo` shares in-flight loads. */
export function createCache({ ttlMs, max = 200 }) {
  const store = new Map()
  const inflight = new Map()
  const fresh = (entry, nowMs) => entry && nowMs - entry.at < ttlMs
  return {
    clear() {
      store.clear()
      inflight.clear()
    },
    peek: (key) => store.get(key),
    get(key, nowMs) {
      const hit = store.get(key)
      return fresh(hit, nowMs) ? hit.value : undefined
    },
    set(key, value, nowMs) {
      store.set(key, { at: nowMs, value })
      if (store.size > max) store.delete(store.keys().next().value) // oldest first
    },
    /** loader() runs at most once for concurrent identical keys; a fresh cached value skips it entirely. */
    async memo(key, nowMs, loader) {
      const hit = this.get(key, nowMs)
      if (hit !== undefined) return hit
      if (inflight.has(key)) return inflight.get(key)
      const job = (async () => {
        const value = await loader()
        this.set(key, value, nowMs)
        return value
      })().finally(() => inflight.delete(key))
      inflight.set(key, job)
      return job
    },
  }
}
