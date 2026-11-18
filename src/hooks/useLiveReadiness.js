import { useEffect, useRef } from 'react'
import { deriveReadiness } from '@/utils/departureStatus'
import { useNow } from './useNow'

/**
 * Keeps a backend plan "alive" on screen without polling the server every second.
 *  - The visible countdown / status are derived locally from the plan's timestamps (useNow).
 *  - When the derived status moves past the one the server reported (e.g. preparation just
 *    started), the plan is refetched ONCE so the server's explanation text is current again.
 *    A ref guard guarantees at most one refetch per (calculation, status) pair.
 */
export function useLiveReadiness(view, refresh) {
  const now = useNow(1000)
  const live = view ? deriveReadiness(view, now) : null
  const refetched = useRef('')

  const liveStatus = live?.status
  const serverStatus = view?.status
  const calculatedAt = view?.calculatedAt

  useEffect(() => {
    if (!liveStatus || liveStatus === serverStatus) return
    const marker = `${calculatedAt}|${liveStatus}`
    if (refetched.current === marker) return
    refetched.current = marker
    refresh?.()
  }, [liveStatus, serverStatus, calculatedAt, refresh])

  return { now, live, stale: Boolean(live) && live.status !== view.status }
}
