import { useEffect, useState } from 'react'

/**
 * The current Date, refreshed every `intervalMs` while the tab is visible.
 *  - One interval per hook, always cleaned up.
 *  - Paused while the tab is hidden (no wasted work) and refreshed IMMEDIATELY when it becomes
 *    visible again, so countdowns that are computed from timestamps are correct the instant you
 *    come back, even though browsers throttle timers in background tabs.
 */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let id = null
    const tick = () => setNow(new Date())
    const start = () => {
      if (id === null) id = setInterval(tick, intervalMs)
    }
    const stop = () => {
      if (id !== null) {
        clearInterval(id)
        id = null
      }
    }
    const onVisibility = () => {
      if (document.hidden) {
        stop()
      } else {
        tick()
        start()
      }
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs])

  return now
}
