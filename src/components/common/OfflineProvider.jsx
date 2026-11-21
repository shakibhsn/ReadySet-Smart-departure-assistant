import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useEventsCache } from '@/hooks/useEventQuery'
import { OfflineContext } from '@/lib/offline/offlineContext'
import { offlineStore } from '@/lib/offline/offlineStore'
import { registerLogoutGuard, setOfflineUser } from '@/lib/offline/offlineUser'
import { flushQueue } from '@/lib/offline/syncQueue'
import { getUpcomingEvents } from '@/services/eventApi'
import { getChecklist, setChecklistItemDoneOnline } from '@/services/checklistApi'
import { getProgress } from '@/utils/events'

const SNAPSHOT_EVERY_MS = 10 * 60_000
const FLUSH_EVERY_MS = 30_000
const SNAPSHOT_EVENTS = 20
const SNAPSHOT_CHECKLISTS = 8

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false

/**
 * Offline support for the signed-in user (remounted per user by UserScopedAppState).
 *  - Keeps a small per-user copy of upcoming events and their checklists (see lib/offline/offlineStore.js).
 *  - Checklist ticks made offline are queued and synced when the connection returns; server data wins conflicts.
 *  - Nothing else works offline: creating or editing events, weather, notifications and settings need the server.
 */
export function OfflineProvider({ children }) {
  const { user } = useAuth()
  const { invalidate } = useEventsCache()
  const userId = user?.id
  const [online, setOnline] = useState(isOnline)
  const [pending, setPending] = useState(0)
  const [conflicts, setConflicts] = useState([])
  const [snapshotAt, setSnapshotAt] = useState(null)
  const [syncVersion, setSyncVersion] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const refreshing = useRef(false)
  const onlineRef = useRef(online)
  useEffect(() => {
    onlineRef.current = online
  }, [online])

  // Set DURING render (an idempotent module value): children's data-loading effects run BEFORE this component's
  // effects, and on an offline reload their very first request must already know whose saved copy to fall back to.
  setOfflineUser(userId)
  useEffect(() => {
    if (!userId) return undefined
    offlineStore.purgeOtherUsers(userId)
    offlineStore.saveSession(user)
    return () => setOfflineUser(null)
  }, [userId, user])

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  const countPending = useCallback(async () => {
    if (!userId) return 0
    const n = (await offlineStore.listQueue(userId)).length
    setPending(n)
    return n
  }, [userId])

  /** Replays queued ticks. Safe to call any time: concurrent calls share one run. */
  const flushNow = useCallback(async () => {
    if (!userId || !onlineRef.current) return null
    setSyncing(true)
    try {
      const result = await flushQueue({
        store: offlineStore,
        userId,
        send: setChecklistItemDoneOnline,
        onItem: async (eventId, item) => {
          const saved = await offlineStore.loadChecklist(userId, eventId)
          if (saved) {
            const items = saved.items.map((i) => (i.id === item.id ? item : i))
            await offlineStore.saveChecklist(userId, eventId, { items, progress: getProgress(items) })
          }
        },
      })
      await countPending()
      if (result.conflicts.length > 0) setConflicts((c) => [...c, ...result.conflicts])
      if (result.synced > 0 || result.conflicts.length > 0) {
        setSyncVersion((v) => v + 1)
        invalidate()
      }
      return result
    } finally {
      setSyncing(false)
    }
  }, [userId, countPending, invalidate])

  /** Copies upcoming events and their checklists for offline use. Skipped while unsynced ticks exist (it would overwrite them). */
  const refreshSnapshot = useCallback(async () => {
    if (!userId || refreshing.current || !onlineRef.current) return
    refreshing.current = true
    try {
      if ((await countPending()) > 0) return
      const events = await getUpcomingEvents({ limit: SNAPSHOT_EVENTS })
      await offlineStore.saveEvents(userId, events)
      const ids = [...new Set(events.map((e) => e.id))].slice(0, SNAPSHOT_CHECKLISTS)
      for (const id of ids) await getChecklist(id) // a successful load saves itself
      setSnapshotAt(new Date().toISOString())
    } catch {
      /* offline support is best effort and must never surface as an error */
    } finally {
      refreshing.current = false
    }
  }, [userId, countPending])

  // On sign-in and whenever the connection returns: sync first, then refresh the copy.
  useEffect(() => {
    if (!userId) return
    offlineStore.listQueue(userId).then((q) => setPending(q.length))
    if (online) flushNow().then(refreshSnapshot)
  }, [userId, online, flushNow, refreshSnapshot])

  useEffect(() => {
    if (!userId) return undefined
    const tick = () => {
      if (document.visibilityState === 'hidden' || !onlineRef.current) return
      flushNow().then(refreshSnapshot)
    }
    const a = setInterval(() => onlineRef.current && countPending().then((n) => n > 0 && flushNow()), FLUSH_EVERY_MS)
    const b = setInterval(tick, SNAPSHOT_EVERY_MS)
    return () => {
      clearInterval(a)
      clearInterval(b)
    }
  }, [userId, flushNow, refreshSnapshot, countPending])

  // Signing out: try one last sync; if changes would be lost, ask first.
  useEffect(() => {
    if (!userId) return undefined
    return registerLogoutGuard(async () => {
      if (onlineRef.current) await flushNow()
      const left = await countPending()
      return left === 0 || window.confirm(`You have ${left} checklist ${left === 1 ? 'change' : 'changes'} that could not be synced yet. Signing out will discard ${left === 1 ? 'it' : 'them'}. Sign out anyway?`)
    })
  }, [userId, flushNow, countPending])

  const value = useMemo(
    () => ({ online, pending, conflicts, snapshotAt, syncVersion, syncing, flushNow, dismissConflicts: () => setConflicts([]) }),
    [online, pending, conflicts, snapshotAt, syncVersion, syncing, flushNow],
  )
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
}
