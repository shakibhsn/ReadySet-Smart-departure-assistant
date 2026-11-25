import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { clearLocation, loadLocation, saveLocation, subscribeLocation } from '@/lib/weatherLocation'

/** The signed-in user's weather location, shared by every component on the page (dashboard card, Explore page). */
export function useWeatherLocation() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [location, setLocationState] = useState(() => loadLocation(userId))

  useEffect(() => {
    const sync = () => setLocationState(loadLocation(userId))
    sync()
    return subscribeLocation(sync)
  }, [userId])

  const setLocation = useCallback((next) => setLocationState(saveLocation(userId, next)), [userId])
  const clear = useCallback(() => {
    clearLocation(userId)
    setLocationState(null)
  }, [userId])
  return { location, setLocation, clear }
}
