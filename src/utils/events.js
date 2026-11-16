import { format } from 'date-fns'

/** Sort API events/occurrences by their absolute start instant (ISO strings in UTC sort correctly). */
export const sortEvents = (events) =>
  [...events].sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id))

/** Events whose LOCAL date (in each event's own timezone, as returned by the API) is the given calendar day. */
export const getEventsOnDay = (events, day) => {
  const key = format(day, 'yyyy-MM-dd')
  return sortEvents(events.filter((e) => e.date === key))
}

export function getProgress(items = []) {
  const total = items.length
  const done = items.filter((i) => i.done).length
  return { total, done, remaining: total - done, percent: total ? Math.round((done / total) * 100) : 0 }
}
