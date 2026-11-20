import { useCallback, useEffect, useState } from 'react'
import { reportForgotten } from '@/services/packingApi'
import { addChecklistItem, applyChecklistTemplate, deleteChecklistItem, getChecklist, setChecklistItemDone, updateChecklistItem } from '@/services/checklistApi'
import { getProgress } from '@/utils/events'

/**
 * One event's checklist, stored in the database. The UI changes immediately:
 * toggling is optimistic (rolled back with a message if the server refuses), everything else
 * updates from the server's response. `loadError` = the list could not be loaded;
 * `actionError` = the last change failed (the list is still usable).
 */
export function useChecklist(eventId) {
  const [state, setState] = useState({ eventId: null, items: [], loadError: null })
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!eventId) return undefined
    let cancelled = false
    getChecklist(eventId)
      .then((data) => !cancelled && setState({ eventId, items: data.items, loadError: null }))
      .catch((error) => !cancelled && setState({ eventId, items: [], loadError: error }))
    return () => { cancelled = true }
  }, [eventId, attempt])

  const settled = !eventId || state.eventId === eventId // no event = nothing to load
  const items = settled && eventId ? state.items : []
  const setItems = useCallback((fn) => setState((s) => (s.eventId === eventId ? { ...s, items: fn(s.items) } : s)), [eventId])

  const run = useCallback(async (fn) => {
    setActionError('')
    setNotice('')
    try {
      return await fn()
    } catch (error) {
      setActionError(error.message)
      return undefined
    }
  }, [])

  const toggle = (item) => run(async () => {
    const done = !item.done
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, done } : i)))
    try {
      await setChecklistItemDone(eventId, item.id, done)
    } catch (error) {
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, done: item.done } : i)))
      throw error
    }
  })
  const add = (text, group) => run(async () => {
    const created = await addChecklistItem(eventId, { text, group })
    setItems((list) => [...list, created])
    return true
  })
  const edit = (item, patch) => run(async () => {
    const saved = await updateChecklistItem(eventId, item.id, patch)
    setItems((list) => list.map((i) => (i.id === item.id ? saved : i)))
    return true
  })
  const remove = (item) => run(async () => {
    await deleteChecklistItem(eventId, item.id)
    setItems((list) => list.filter((i) => i.id !== item.id))
  })
  /** An explicit user report. Nothing is ever inferred from unchecked items. */
  const forgot = (item) => run(async () => {
    const r = await reportForgotten(eventId, item.id)
    setNotice(r.reported ? `Noted: you forgot "${item.text}". If this keeps happening, ReadySet will suggest it next time.` : `You already noted "${item.text}" today.`)
  })
  const applyTemplate = (template) => run(async () => {
    const result = await applyChecklistTemplate(eventId, template)
    setItems(() => result.items)
    setNotice(result.added > 0 ? `Added ${result.added} ${result.added === 1 ? 'item' : 'items'}${result.skipped ? ` (${result.skipped} already on your list)` : ''}.` : 'Nothing new to add from this template.')
  })

  return {
    items,
    progress: getProgress(items),
    loading: !settled,
    loadError: settled ? state.loadError : null,
    actionError,
    notice,
    reload: () => setAttempt((a) => a + 1),
    toggle, add, edit, remove, applyTemplate, forgot,
  }
}
