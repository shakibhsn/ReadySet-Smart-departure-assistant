import { useCallback, useMemo, useState } from 'react'
import { AppStateContext } from '@/lib/appStateContext'
import { mockNotifications } from '@/data/notifications'
import { defaultSettings } from '@/data/user'

/**
 * Temporary, in-memory client state that is NOT in the database yet: notifications (still mock) and
 * device-only settings. Events (hooks/useEventQuery.js) and checklists (hooks/useChecklist.js) come from the API.
 */
export function AppStateProvider({ children }) {
  const [notifications, setNotifications] = useState(mockNotifications)
  const [settings, setSettings] = useState(defaultSettings)

  const markRead = useCallback(
    (id) => setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n))),
    [],
  )
  const markAllRead = useCallback(
    () => setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))),
    [],
  )
  const updateSettings = useCallback((patch) => setSettings((prev) => ({ ...prev, ...patch })), [])

  const value = useMemo(
    () => ({
      notifications, markRead, markAllRead,
      settings, updateSettings,
    }),
    [notifications, markRead, markAllRead, settings, updateSettings],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
