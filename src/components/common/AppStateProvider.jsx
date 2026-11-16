import { useCallback, useMemo, useState } from 'react'
import { AppStateContext } from '@/lib/appStateContext'
import { mockEvents } from '@/data/events'
import { itemsFromTemplate, makeItem, mockChecklists } from '@/data/checklists'
import { mockNotifications } from '@/data/notifications'
import { defaultSettings } from '@/data/user'
import { sortEvents } from '@/utils/events'

export function AppStateProvider({ children }) {
  const [events, setEvents] = useState(mockEvents)
  const [checklists, setChecklists] = useState(mockChecklists)
  const [notifications, setNotifications] = useState(mockNotifications)
  const [settings, setSettings] = useState(defaultSettings)

  const addEvent = useCallback((event) => {
    const id = `evt-${Date.now().toString(36)}`
    setEvents((prev) => sortEvents([...prev, { ...event, id }]))
    setNotifications((prev) => [
      {
        id: `n-${id}`,
        category: 'event',
        title: 'New event added',
        body: `${event.title} was added to your schedule.`,
        createdAt: new Date().toISOString(),
        read: false,
      },
      ...prev,
    ])
    return id
  }, [])

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
      events, addEvent,
      checklists, toggleItem, addItem, deleteItem, applyTemplate,
      notifications, markRead, markAllRead,
      settings, updateSettings,
    }),
    [events, addEvent, checklists, toggleItem, addItem, deleteItem, applyTemplate, notifications, markRead, markAllRead, settings, updateSettings],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
