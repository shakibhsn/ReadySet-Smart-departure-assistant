import { isSameDay } from 'date-fns'
import { getEventDeparture, parseDateTime } from './departure'

export function sortEvents(events) {
  return [...events].sort((a, b) =>
    `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
  )
}

/** First event that has not started yet. */
export function getNextEvent(events, now = new Date()) {
  return sortEvents(events).find((e) => {
    const start = parseDateTime(e.date, e.startTime)
    return start && start > now
  })
}

export const getEventsOnDay = (events, day) =>
  sortEvents(events).filter((e) => {
    const d = parseDateTime(e.date, e.startTime)
    return d && isSameDay(d, day)
  })

export function getProgress(items = []) {
  const total = items.length
  const done = items.filter((i) => i.done).length
  return { total, done, remaining: total - done, percent: total ? Math.round((done / total) * 100) : 0 }
}

export { getEventDeparture }
