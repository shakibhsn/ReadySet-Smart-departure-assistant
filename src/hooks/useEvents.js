import { useEventsCache, useEventQuery } from './useEventQuery'
import { createEvent, deleteEvent, updateEvent, getUpcomingEvents } from '@/services/eventApi'

/** Create / update / delete that keep every mounted event query in sync afterwards. */
export function useEventMutations() {
  const { invalidate } = useEventsCache()
  return {
    create: async (payload) => {
      const event = await createEvent(payload)
      invalidate()
      return event
    },
    update: async (id, payload) => {
      const event = await updateEvent(id, payload)
      invalidate()
      return event
    },
    remove: async (id) => {
      await deleteEvent(id)
      invalidate()
    },
  }
}

/** One entry per event (first upcoming occurrence), for selectors on the Checklist / Planner pages. */
export function useUpcomingEventList(limit = 50) {
  const query = useEventQuery(() => getUpcomingEvents({ limit }), [limit])
  const seen = new Set()
  const events = (query.data ?? []).filter((e) => !seen.has(e.id) && seen.add(e.id))
  return { ...query, events }
}
