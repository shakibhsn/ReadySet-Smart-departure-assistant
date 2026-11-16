import { useCallback, useMemo, useState } from 'react'
import { AppStateContext } from '@/lib/appStateContext'
import { itemsFromTemplate, makeItem } from '@/data/checklists'
import { mockNotifications } from '@/data/notifications'
import { defaultSettings } from '@/data/user'

/**
 * Temporary, in-memory client state that is NOT in the database yet (Day 5+ moves it there):
 * checklists (keyed by real event id), notifications (still mock) and device-only settings.
 * Events are no longer here: they come from the API (see hooks/useEventQuery.js).
 */
export function AppStateProvider({ children }) {
  const [checklists, setChecklists] = useState({})
  const [notifications, setNotifications] = useState(mockNotifications)
  const [settings, setSettings] = useState(defaultSettings)

  const updateChecklist = useCallback((eventId, fn) => {
    setChecklists((prev) => ({ ...prev, [eventId]: fn(prev[eventId] ?? []) }))
  }, [])

  const toggleItem = useCallback(
    (eventId, itemId) =>
      updateChecklist(eventId, (items) => items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i))),
    [updateChecklist],
  )
  const addItem = useCallback(
    (eventId, text, group) => updateChecklist(eventId, (items) => [...items, makeItem(text, group)]),
    [updateChecklist],
  )
  const deleteItem = useCallback(
    (eventId, itemId) => updateChecklist(eventId, (items) => items.filter((i) => i.id !== itemId)),
    [updateChecklist],
  )
  const applyTemplate = useCallback(
    (eventId, templateKey) =>
      updateChecklist(eventId, (items) => {
        const existing = new Set(items.map((i) => i.text.toLowerCase()))
        return [...items, ...itemsFromTemplate(templateKey).filter((i) => !existing.has(i.text.toLowerCase()))]
      }),
    [updateChecklist],
  )

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
      checklists, toggleItem, addItem, deleteItem, applyTemplate,
      notifications, markRead, markAllRead,
      settings, updateSettings,
    }),
    [checklists, toggleItem, addItem, deleteItem, applyTemplate, notifications, markRead, markAllRead, settings, updateSettings],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
