import { useCallback, useMemo, useState } from 'react'
import { AppStateContext } from '@/lib/appStateContext'
import { defaultSettings } from '@/data/user'

/**
 * Temporary, in-memory client state: device-only settings. Events (hooks/useEventQuery.js), checklists
 * (hooks/useChecklist.js) and notifications (hooks/useNotifications.js) come from the API.
 */
export function AppStateProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings)

  const updateSettings = useCallback((patch) => setSettings((prev) => ({ ...prev, ...patch })), [])

  const value = useMemo(
    () => ({
      settings, updateSettings,
    }),
    [settings, updateSettings],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
