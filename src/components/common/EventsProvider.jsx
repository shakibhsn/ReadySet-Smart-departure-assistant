import { useCallback, useMemo, useState } from 'react'
import { EventsCacheContext } from '@/lib/eventsCacheContext'

export function EventsProvider({ children }) {
  const [version, setVersion] = useState(0)
  const invalidate = useCallback(() => setVersion((v) => v + 1), [])
  const value = useMemo(() => ({ version, invalidate }), [version, invalidate])
  return <EventsCacheContext.Provider value={value}>{children}</EventsCacheContext.Provider>
}
