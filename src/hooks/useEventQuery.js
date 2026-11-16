import { useContext, useEffect, useState } from 'react'
import { EventsCacheContext } from '@/lib/eventsCacheContext'

export function useEventsCache() {
  const ctx = useContext(EventsCacheContext)
  if (!ctx) throw new Error('useEventsCache must be used inside <EventsProvider>')
  return ctx
}

/**
 * Small data-fetching hook for event endpoints (no extra library).
 *  - Runs once per distinct `deps` and again whenever any event is created / updated / deleted
 *    (the shared cache version changes), so every screen stays in sync.
 *  - Keeps the previous data while refetching (`loading` is true only for the current request).
 *  - Ignores responses from outdated requests.
 * `fetcher` must only depend on values listed in `deps`.
 */
export function useEventQuery(fetcher, deps = []) {
  const { version } = useEventsCache()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState({ key: null, data: null, error: null })
  const key = JSON.stringify([...deps, version, attempt])

  useEffect(() => {
    let cancelled = false
    fetcher()
      .then((data) => !cancelled && setResult({ key, data, error: null }))
      .catch((error) => !cancelled && setResult({ key, data: null, error }))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const settled = result.key === key
  return {
    data: result.data,
    error: settled ? result.error : null,
    loading: !settled,
    reload: () => setAttempt((a) => a + 1),
  }
}
