import { describe, expect, it } from 'vitest'
import { detectConflicts, toItem } from '../src/services/conflict/conflictRules.js'

// Event priority only changes the ORDER of conflicts (a conflict involving a high-priority event is listed first within the
// same severity). It never hides, merges or changes a conflict.
const at = (iso) => new Date(iso)
const item = (id, start, priority, over = {}) =>
  toItem({
    key: `${id}@${start}`,
    eventId: id,
    at: at(start),
    event: { timezone: 'UTC', destination: null, durationMinutes: 120, travelDurationMinutes: 10, preparationMinutes: 10, arrivalBufferMinutes: 5, ...(priority && { priority }), ...over },
  })
const withTitle = (i, title) => ({ ...i, title })

const early = [withTitle(item('a1', '2030-05-10T08:00:00Z', 'normal'), 'Early one'), withTitle(item('a2', '2030-05-10T09:00:00Z', 'normal'), 'Early two')]
const late = (priority) => [withTitle(item('b1', '2030-05-10T15:00:00Z', priority), 'Late one'), withTitle(item('b2', '2030-05-10T16:00:00Z', 'normal'), 'Late two')]

describe('conflict ordering with event priority', () => {
  it('without priorities the order is exactly as before: by time', () => {
    const out = detectConflicts([...early, ...late('normal')])
    expect(out.map((c) => c.events[0].title)).toEqual(['Early one', 'Late one'])
  })

  it('a conflict involving a HIGH-priority event comes first within the same severity', () => {
    const out = detectConflicts([...early, ...late('high')])
    expect(out.map((c) => c.events[0].title)).toEqual(['Late one', 'Early one'])
    expect(out[0].events.map((e) => e.priority)).toEqual(['high', 'normal'])
  })

  it('nothing is hidden or changed: the same conflicts, with and without priority', () => {
    const plain = detectConflicts([...early, ...late('normal')])
    const emphasised = detectConflicts([...early, ...late('high')])
    expect(emphasised).toHaveLength(plain.length)
    expect(emphasised.map((c) => c.id).sort()).toEqual(plain.map((c) => c.id).sort())
    expect(emphasised.map((c) => c.severity)).toEqual(plain.map((c) => c.severity))
  })

  it('priority never outranks severity: a medium conflict stays after a high-severity one', () => {
    const tight = [withTitle(item('t1', '2030-05-10T08:00:00Z', 'high', { durationMinutes: 60, destination: 'A' }), 'Tight one'), withTitle(item('t2', '2030-05-10T09:10:00Z', 'normal', { destination: 'B', preparationMinutes: 30 }), 'Tight two')]
    const out = detectConflicts([...tight, ...late('normal')])
    const severities = out.map((c) => c.severity)
    expect(severities).toEqual([...severities].sort((a, b) => (a === b ? 0 : a === 'high' ? -1 : 1)))
  })

  it('low and missing priority behave like normal; unknown values never break anything', () => {
    expect(item('x', '2030-05-10T08:00:00Z', 'low').priority).toBe('low')
    expect(item('x', '2030-05-10T08:00:00Z', undefined).priority).toBe('normal')
    expect(() => detectConflicts([...early, ...late('bogus')])).not.toThrow()
  })
})
