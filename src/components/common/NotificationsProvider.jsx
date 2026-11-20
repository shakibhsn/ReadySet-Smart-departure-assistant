import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NotificationsContext } from '@/lib/notificationsContext'
import { deleteNotification, getNotificationPreferences, getNotifications, markAllNotificationsRead, markNotificationRead, updateNotificationPreferences } from '@/services/notificationApi'

const POLL_MS = 60_000
const PAGE = 50

/** 'unsupported' | 'default' | 'granted' | 'denied' (the browser's own permission state). */
const readPermission = () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

/**
 * Notifications for the signed-in user (remounted per user by UserScopedAppState).
 *  - The server creates notifications (one scheduler); the browser only READS them, once a minute while the tab
 *    is visible, so there is no per-event timer on the client and no polling storm.
 *  - Browser (Web Notifications) alerts are optional: permission is requested ONLY by `enableBrowser()` from a
 *    click, never on load. They only appear while ReadySet is open in a browser tab (no service worker / push).
 */
export function NotificationsProvider({ children }) {
  const [state, setState] = useState({ items: [], unreadCount: 0, page: 1, totalPages: 1, loaded: false, error: null })
  const [prefs, setPrefs] = useState(null)
  const [permission, setPermission] = useState(readPermission)
  const [actionError, setActionError] = useState('')
  const shown = useRef(null) // ids already seen (null until the first load, so old notifications never pop up)
  const prefsRef = useRef(null)
  useEffect(() => {
    prefsRef.current = prefs
  }, [prefs])

  const announce = useCallback((items) => {
    const seen = shown.current
    if (seen === null) {
      shown.current = new Set(items.map((n) => n.id)) // first load: everything existing counts as already seen
      return
    }
    for (const n of items) {
      if (n.read || seen.has(n.id)) continue
      seen.add(n.id)
      if (prefsRef.current?.browser && readPermission() === 'granted') {
        try {
          new Notification(n.title, { body: n.body, tag: n.id })
        } catch {
          /* some browsers refuse the constructor (e.g. certain mobile ones): in-app notifications still work */
        }
      }
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const data = await getNotifications({ limit: PAGE, page: 1 })
      announce(data.notifications)
      setState({ items: data.notifications, unreadCount: data.unreadCount, page: 1, totalPages: data.pagination.totalPages, loaded: true, error: null })
    } catch (error) {
      setState((s) => ({ ...s, loaded: true, error })) // keep what we had; the UI shows a retry
    }
  }, [announce])

  useEffect(() => {
    refresh()
    getNotificationPreferences().then(setPrefs).catch(() => setPrefs(null))
    const tick = () => document.visibilityState !== 'hidden' && refresh()
    const id = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [refresh])

  const loadMore = useCallback(async () => {
    const next = state.page + 1
    try {
      const data = await getNotifications({ limit: PAGE, page: next })
      setState((s) => ({ ...s, items: [...s.items, ...data.notifications.filter((n) => !s.items.some((o) => o.id === n.id))], page: next, totalPages: data.pagination.totalPages, unreadCount: data.unreadCount }))
    } catch (error) {
      setActionError(error.message)
    }
  }, [state.page])

  const run = useCallback(async (optimistic, call) => {
    setActionError('')
    setState((s) => optimistic(s))
    try {
      const result = await call()
      setState((s) => ({ ...s, unreadCount: result.unreadCount ?? s.unreadCount }))
    } catch (error) {
      setActionError(error.message)
      refresh() // roll back to what the server really has
    }
  }, [refresh])

  const markRead = (id) =>
    run((s) => ({ ...s, items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)), unreadCount: Math.max(0, s.unreadCount - (s.items.find((n) => n.id === id && !n.read) ? 1 : 0)) }), () => markNotificationRead(id))
  const markAllRead = () => run((s) => ({ ...s, items: s.items.map((n) => ({ ...n, read: true })), unreadCount: 0 }), markAllNotificationsRead)
  const remove = (id) =>
    run((s) => ({ ...s, items: s.items.filter((n) => n.id !== id), unreadCount: Math.max(0, s.unreadCount - (s.items.find((n) => n.id === id && !n.read) ? 1 : 0)) }), () => deleteNotification(id))

  const savePrefs = useCallback(async (patch) => {
    const previous = prefsRef.current
    setPrefs((p) => ({ ...p, ...patch })) // optimistic
    setActionError('')
    try {
      setPrefs(await updateNotificationPreferences(patch))
      return true
    } catch (error) {
      setPrefs(previous)
      setActionError(error.message)
      return false
    }
  }, [])

  /** Must be called from a user click. Asks the browser for permission, then remembers the opt-in. */
  const enableBrowser = useCallback(async () => {
    if (readPermission() === 'unsupported') return 'unsupported'
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result === 'granted') await savePrefs({ browser: true })
    return result
  }, [savePrefs])
  const disableBrowser = useCallback(() => savePrefs({ browser: false }), [savePrefs])

  const value = useMemo(
    () => ({
      items: state.items, unreadCount: state.unreadCount, loaded: state.loaded, error: state.error, hasMore: state.page < state.totalPages, actionError,
      refresh, loadMore, markRead, markAllRead, remove,
      prefs, savePrefs, permission, enableBrowser, disableBrowser,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, prefs, permission, actionError, refresh, loadMore, savePrefs, enableBrowser, disableBrowser],
  )
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}
