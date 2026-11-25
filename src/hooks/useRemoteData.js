import { useEffect, useState } from 'react'

/**
 * Small fetch hook for Weather & Explore (no cache of its own: the server caches). `fetcher` may return null to mean "nothing to load".
 * Keeps the previous data while refreshing, ignores outdated responses, and exposes reload().
 */
export function useRemoteData(fetcher, deps = []) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ key: null, data: null, error: null })
  const key = JSON.stringify([...deps, attempt])

  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(fetcher)
      .then((data) => !cancelled && setState({ key, data, error: null }))
      .catch((error) => !cancelled && setState({ key, data: null, error }))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const settled = state.key === key
  return { data: state.data, error: settled ? state.error : null, loading: !settled, reload: () => setAttempt((a) => a + 1) }
}
