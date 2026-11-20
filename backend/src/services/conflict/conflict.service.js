import { listOccurrenceRecords } from '../event.service.js'
import { ASSUMPTIONS, MAX_DAYS, detectConflicts, toItem } from './conflictRules.js'

export { MAX_DAYS }
const MAX_ITEMS = 300 // bounded work per request

/** Read-only: loads the user's own occurrences (skipped ones excluded, edited ones applied) and analyses them. */
export async function getConflicts(userId, { from, days }, now = new Date()) {
  const start = from ?? now
  const end = new Date(start.getTime() + days * 86_400_000)
  const records = (await listOccurrenceRecords(userId, start, end)).slice(0, MAX_ITEMS)
  const items = records.map(({ event, at, originalStart }) => toItem({ key: `${event.id}@${originalStart.toISOString()}`, eventId: event.id, at, event }))
  const conflicts = detectConflicts(items)
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    eventsChecked: items.length,
    summary: { high: conflicts.filter((c) => c.severity === 'high').length, medium: conflicts.filter((c) => c.severity === 'medium').length },
    conflicts,
    assumptions: ASSUMPTIONS,
  }
}
