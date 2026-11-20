import { describe, expect, it } from 'vitest'
import { DEFAULT_DURATION_MINUTES, detectConflicts, toItem } from '../src/services/conflict/conflictRules.js'
import { MAX_SHIFT_DAYS, findOccurrence, isGeneratedOccurrence, nextOccurrence, occurrencesOf } from '../src/services/occurrence.js'
import { expandOccurrences, nthOccurrence } from '../src/services/recurrence.service.js'

// Pure: no database, no network.
const iso = (list) => list.map((d) => d.toISOString())
const rule = (over = {}) => ({ frequency: 'DAILY', interval: 1, daysOfWeek: [], endsAt: null, ...over })
const range = (series, from, to, o) => iso(expandOccurrences(series, new Date(from), new Date(to), o))

describe('monthly recurrence', () => {
  const series = (startAt, over = {}) => ({ startAt: new Date(startAt), timezone: 'Asia/Dhaka', rule: rule({ frequency: 'MONTHLY', ...over }) })

  it('repeats on the same day of the month at the same local time', () => {
    expect(range(series('2030-01-15T04:00:00Z'), '2030-01-01T00:00:00Z', '2030-04-30T00:00:00Z')).toEqual([
      '2030-01-15T04:00:00.000Z', '2030-02-15T04:00:00.000Z', '2030-03-15T04:00:00.000Z', '2030-04-15T04:00:00.000Z',
    ])
  })
  it('clamps day 31 to the last day of shorter months (documented rule)', () => {
    expect(range(series('2030-01-31T04:00:00Z'), '2030-01-01T00:00:00Z', '2030-05-31T23:59:00Z')).toEqual([
      '2030-01-31T04:00:00.000Z', '2030-02-28T04:00:00.000Z', '2030-03-31T04:00:00.000Z', '2030-04-30T04:00:00.000Z', '2030-05-31T04:00:00.000Z',
    ])
  })
  it('honours the interval (every 2 months) and never goes before the first occurrence', () => {
    expect(range(series('2030-01-15T04:00:00Z', { interval: 2 }), '2029-06-01T00:00:00Z', '2030-07-31T00:00:00Z')).toEqual([
      '2030-01-15T04:00:00.000Z', '2030-03-15T04:00:00.000Z', '2030-05-15T04:00:00.000Z', '2030-07-15T04:00:00.000Z',
    ])
  })
})

describe('daylight saving and timezones', () => {
  it('keeps the LOCAL clock time across a DST change while the UTC instant shifts (New York, 2030-03-10)', () => {
    const series = { startAt: new Date('2030-03-08T14:00:00Z'), timezone: 'America/New_York', rule: rule() } // 09:00 EST
    expect(range(series, '2030-03-08T00:00:00Z', '2030-03-11T23:59:00Z')).toEqual([
      '2030-03-08T14:00:00.000Z', '2030-03-09T14:00:00.000Z', '2030-03-10T13:00:00.000Z', '2030-03-11T13:00:00.000Z', // 09:00 EDT = 13:00Z
    ])
  })
  it('a monthly series also keeps its local time across DST', () => {
    const series = { startAt: new Date('2030-02-10T14:00:00Z'), timezone: 'America/New_York', rule: rule({ frequency: 'MONTHLY' }) }
    expect(range(series, '2030-02-01T00:00:00Z', '2030-04-30T00:00:00Z')).toEqual(['2030-02-10T14:00:00.000Z', '2030-03-10T13:00:00.000Z', '2030-04-10T13:00:00.000Z'])
  })
})

describe('end by count, caps and idempotence', () => {
  it('nthOccurrence returns the Nth start (daily, weekly, monthly) or null when impossible', () => {
    const base = { startAt: new Date('2030-05-06T04:00:00Z'), timezone: 'Asia/Dhaka' } // Monday
    expect(nthOccurrence({ ...base, rule: rule() }, 5).toISOString()).toBe('2030-05-10T04:00:00.000Z')
    expect(nthOccurrence({ ...base, rule: rule({ frequency: 'WEEKLY', daysOfWeek: [1, 3] }) }, 3).toISOString()).toBe('2030-05-13T04:00:00.000Z')
    expect(nthOccurrence({ ...base, rule: rule({ frequency: 'MONTHLY' }) }, 3).toISOString()).toBe('2030-07-06T04:00:00.000Z')
    expect(nthOccurrence({ ...base, rule: rule({ frequency: 'MONTHLY', interval: 12 }) }, 50, { horizonDays: 365 })).toBeNull()
  })
  it('expansion is capped, so a series can never generate unlimited occurrences', () => {
    const series = { startAt: new Date('2030-01-01T04:00:00Z'), timezone: 'Asia/Dhaka', rule: rule() }
    expect(expandOccurrences(series, new Date('2030-01-01T00:00:00Z'), new Date('2040-01-01T00:00:00Z'))).toHaveLength(500)
    expect(expandOccurrences(series, new Date('2030-01-01T00:00:00Z'), new Date('2040-01-01T00:00:00Z'), { max: 7 })).toHaveLength(7)
  })
  it('is idempotent: the same window twice, and overlapping windows, never produce duplicates', () => {
    const series = { startAt: new Date('2030-01-01T04:00:00Z'), timezone: 'Asia/Dhaka', rule: rule({ frequency: 'WEEKLY', daysOfWeek: [2] }) }
    const a = range(series, '2030-01-01T00:00:00Z', '2030-03-01T00:00:00Z')
    expect(range(series, '2030-01-01T00:00:00Z', '2030-03-01T00:00:00Z')).toEqual(a)
    const merged = [...range(series, '2030-01-01T00:00:00Z', '2030-02-01T00:00:00Z'), ...range(series, '2030-01-20T00:00:00Z', '2030-03-01T00:00:00Z')]
    expect([...new Set(merged)].sort()).toEqual(a)
  })
})

describe('occurrence exceptions (services/occurrence.js)', () => {
  const D = (s) => new Date(s)
  const event = (exceptions = []) => ({
    id: 'e1', title: 'Class', timezone: 'Asia/Dhaka', startAt: D('2030-05-06T04:00:00Z'), destination: 'Hall A', notes: null,
    travelDurationMinutes: 30, preparationMinutes: 30, arrivalBufferMinutes: 10, durationMinutes: null, recurrenceRule: rule(), exceptions,
  })
  const ex = (kind, originalStart, over = {}) => ({ kind, originalStart: D(originalStart), startAt: null, title: null, destination: null, notes: null, travelDurationMinutes: null, preparationMinutes: null, arrivalBufferMinutes: null, durationMinutes: null, ...over })
  const win = [D('2030-05-06T00:00:00Z'), D('2030-05-10T23:59:00Z')]

  it('with no exceptions every day appears once', () => {
    expect(occurrencesOf(event(), ...win)).toHaveLength(5)
  })
  it('a SKIPPED occurrence disappears and the others stay', () => {
    const days = occurrencesOf(event([ex('SKIPPED', '2030-05-08T04:00:00Z')]), ...win).map((o) => o.at.toISOString())
    expect(days).not.toContain('2030-05-08T04:00:00.000Z')
    expect(days).toHaveLength(4)
  })
  it('an OVERRIDDEN occurrence moves and merges only the fields it sets', () => {
    const e = event([ex('OVERRIDDEN', '2030-05-08T04:00:00Z', { startAt: D('2030-05-08T06:00:00Z'), travelDurationMinutes: 90, title: 'Class (room change)' })])
    const o = occurrencesOf(e, ...win).find((x) => x.modified)
    expect(o.at.toISOString()).toBe('2030-05-08T06:00:00.000Z')
    expect(o.originalStart.toISOString()).toBe('2030-05-08T04:00:00.000Z')
    expect(o.event).toMatchObject({ title: 'Class (room change)', travelDurationMinutes: 90, preparationMinutes: 30, destination: 'Hall A' })
    expect(e.travelDurationMinutes).toBe(30) // the series itself is untouched
  })
  it('a moved occurrence is found by its original or its new start; a skipped one is not found', () => {
    const e = event([ex('OVERRIDDEN', '2030-05-08T04:00:00Z', { startAt: D('2030-05-08T06:00:00Z') }), ex('SKIPPED', '2030-05-09T04:00:00Z')])
    expect(findOccurrence(e, D('2030-05-08T04:00:00Z')).at.toISOString()).toBe('2030-05-08T06:00:00.000Z')
    expect(findOccurrence(e, D('2030-05-08T06:00:00Z')).originalStart.toISOString()).toBe('2030-05-08T04:00:00.000Z')
    expect(findOccurrence(e, D('2030-05-09T04:00:00Z'))).toBeNull()
  })
  it('nextOccurrence never returns a skipped occurrence', () => {
    const e = event([ex('SKIPPED', '2030-05-08T04:00:00Z')])
    expect(nextOccurrence(e, D('2030-05-08T00:00:00Z')).at.toISOString()).toBe('2030-05-09T04:00:00.000Z')
  })
  it('isGeneratedOccurrence validates requests: only real generated starts count', () => {
    const e = event()
    expect(isGeneratedOccurrence(e, D('2030-05-08T04:00:00Z'))).toBe(true)
    expect(isGeneratedOccurrence(e, D('2030-05-08T05:00:00Z'))).toBe(false)
    expect(MAX_SHIFT_DAYS).toBe(7)
  })
  it('non-recurring events pass through untouched', () => {
    const single = { ...event(), recurrenceRule: null, isRecurring: false }
    expect(occurrencesOf(single, ...win)).toHaveLength(1)
    expect(occurrencesOf(single, D('2031-01-01T00:00:00Z'), D('2031-02-01T00:00:00Z'))).toEqual([])
  })
})

describe('conflict rules', () => {
  // Times are Asia/Dhaka (UTC+6): 10:00 local = 04:00Z.
  const occ = (key, startIso, over = {}) => toItem({ key, eventId: key, at: new Date(startIso), event: { title: key, timezone: 'Asia/Dhaka', destination: null, durationMinutes: 60, travelDurationMinutes: 30, preparationMinutes: 30, arrivalBufferMinutes: 10, ...over } })
  const kinds = (...items) => detectConflicts(items).map((c) => c.type)

  it('no conflict for events with plenty of time between them', () => {
    expect(kinds(occ('A', '2030-05-10T04:00:00Z', { destination: 'X' }), occ('B', '2030-05-10T09:00:00Z', { destination: 'Y' }))).toEqual([])
  })
  it('overlap: high severity, explains it, and suggests a later start without changing anything', () => {
    const items = [occ('A', '2030-05-10T04:00:00Z', { destination: 'X' }), occ('B', '2030-05-10T04:30:00Z', { destination: 'Y' })]
    const [c] = detectConflicts(items)
    expect(c).toMatchObject({ type: 'OVERLAP', severity: 'high' })
    expect(c.message).toContain('"A" (10:00 AM–11:00 AM) overlaps "B"')
    // A ends 05:00Z; B needs prep 30 + travel 30 + buffer 10 = 70 min -> 06:10Z (already a multiple of 5)
    expect(c.suggestion).toMatchObject({ eventId: 'B', suggestedStartAt: '2030-05-10T06:10:00.000Z', shiftMinutes: 100, local: { time12: '12:10 PM' } })
    expect(c.suggestion.note).toMatch(/Nothing has been changed/)
    expect(items[1].start.toISOString()).toBe('2030-05-10T04:30:00.000Z')
  })
  it('unreachable: leaving for B (travel included) would have to happen before A ends', () => {
    // A 10:00-11:00 at X, B 11:20 at Y with 30 min travel: depart 10:40 < 11:00 -> impossible by 20 min
    const [c] = detectConflicts([occ('A', '2030-05-10T04:00:00Z', { destination: 'X' }), occ('B', '2030-05-10T05:20:00Z', { destination: 'Y', preparationMinutes: 0 })])
    expect(c).toMatchObject({ type: 'UNREACHABLE', severity: 'high' })
    expect(c.message).toContain('20 min short')
  })
  it('tight preparation: reachable but the preparation would have to start before the previous event ends (medium)', () => {
    // B 12:00, buffer 10, travel 30 -> leave 11:20 (ok, after 11:00 end); prep 45 starts 10:35 < 11:00
    const [c] = detectConflicts([occ('A', '2030-05-10T04:00:00Z', { destination: 'X' }), occ('B', '2030-05-10T06:00:00Z', { destination: 'Y', preparationMinutes: 45 })])
    expect(c).toMatchObject({ type: 'TIGHT_PREPARATION', severity: 'medium' })
  })
  it('same destination: back-to-back events are not a travel or preparation conflict, but an overlap still is', () => {
    expect(kinds(occ('A', '2030-05-10T04:00:00Z', { destination: 'Hall  A' }), occ('B', '2030-05-10T05:00:00Z', { destination: 'hall a' }))).toEqual([])
    expect(kinds(occ('A', '2030-05-10T04:00:00Z', { destination: 'Hall A' }), occ('B', '2030-05-10T04:30:00Z', { destination: 'Hall A' }))).toEqual(['OVERLAP'])
  })
  it('a missing destination never produces a travel conflict (no invented travel), only preparation timing', () => {
    expect(kinds(occ('A', '2030-05-10T04:00:00Z', { destination: 'X' }), occ('B', '2030-05-10T05:20:00Z', { destination: null, preparationMinutes: 0 }))).toEqual([])
  })
  it('events without a duration are assumed to last 60 minutes and flagged as assumed', () => {
    const a = occ('A', '2030-05-10T04:00:00Z', { durationMinutes: null })
    expect(a.assumedDuration).toBe(true)
    expect(a.end.getTime() - a.start.getTime()).toBe(DEFAULT_DURATION_MINUTES * 60_000)
    const [c] = detectConflicts([a, occ('B', '2030-05-10T04:30:00Z')])
    expect(c.events[0].assumedDuration).toBe(true)
  })
  it('high severity is listed before medium', () => {
    const list = detectConflicts([
      occ('A', '2030-05-10T04:00:00Z', { destination: 'X' }), occ('B', '2030-05-10T06:00:00Z', { destination: 'Y', preparationMinutes: 45 }),
      occ('C', '2030-05-11T04:00:00Z'), occ('D', '2030-05-11T04:10:00Z'),
    ])
    expect(list.map((c) => c.severity)).toEqual(['high', 'medium'])
  })
  it('writes times in each event timezone', () => {
    const ny = (key, iso) => toItem({ key, eventId: key, at: new Date(iso), event: { title: key, timezone: 'America/New_York', destination: null, durationMinutes: 60, travelDurationMinutes: 30, preparationMinutes: 30, arrivalBufferMinutes: 10 } })
    const [c] = detectConflicts([ny('A', '2030-05-10T13:00:00Z'), ny('B', '2030-05-10T13:30:00Z')]) // 9:00 and 9:30 EDT
    expect(c.message).toContain('9:00 AM–10:00 AM')
    expect(c.message).toContain('starts at 9:30 AM')
  })
})
