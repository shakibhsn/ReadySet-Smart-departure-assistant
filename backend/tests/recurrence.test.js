import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import { MAX_OCCURRENCES, expandOccurrences } from '../src/services/recurrence.service.js'
import { parseStart } from '../src/utils/timezone.js'

const at = (iso, zone) => DateTime.fromISO(iso, { zone }).toJSDate()
const local = (dates, zone) => dates.map((d) => DateTime.fromJSDate(d, { zone }).toFormat("yyyy-MM-dd HH:mm"))

describe('expandOccurrences (pure recurrence calculation)', () => {
  it('returns a single event only when it falls inside the range', () => {
    const startAt = at('2026-11-20T10:00', 'Asia/Dhaka')
    const series = { startAt, timezone: 'Asia/Dhaka', rule: null }
    expect(expandOccurrences(series, at('2026-11-20T00:00', 'Asia/Dhaka'), at('2026-11-20T23:59', 'Asia/Dhaka'))).toEqual([startAt])
    expect(expandOccurrences(series, at('2026-11-21T00:00', 'Asia/Dhaka'), at('2026-11-22T00:00', 'Asia/Dhaka'))).toEqual([])
  })

  it('DAILY: every day at 09:00, starting at the event start (not before it)', () => {
    const zone = 'Asia/Dhaka'
    const series = { startAt: at('2026-11-20T09:00', zone), timezone: zone, rule: { frequency: 'DAILY', interval: 1, daysOfWeek: [], endsAt: null } }
    const out = expandOccurrences(series, at('2026-11-18T00:00', zone), at('2026-11-23T23:59', zone))
    expect(local(out, zone)).toEqual(['2026-11-20 09:00', '2026-11-21 09:00', '2026-11-22 09:00', '2026-11-23 09:00'])
  })

  it('DAILY with interval 2 skips alternate days', () => {
    const zone = 'UTC'
    const series = { startAt: at('2026-11-01T08:00', zone), timezone: zone, rule: { frequency: 'DAILY', interval: 2, daysOfWeek: [], endsAt: null } }
    expect(local(expandOccurrences(series, at('2026-11-01T00:00', zone), at('2026-11-08T00:00', zone)), zone)).toEqual([
      '2026-11-01 08:00', '2026-11-03 08:00', '2026-11-05 08:00', '2026-11-07 08:00',
    ])
  })

  it('WEEKLY: Monday and Wednesday at 10:00', () => {
    const zone = 'Asia/Dhaka'
    // 2026-11-16 is a Monday
    const series = { startAt: at('2026-11-16T10:00', zone), timezone: zone, rule: { frequency: 'WEEKLY', interval: 1, daysOfWeek: [1, 3], endsAt: null } }
    const out = expandOccurrences(series, at('2026-11-16T00:00', zone), at('2026-11-30T23:59', zone))
    expect(local(out, zone)).toEqual([
      '2026-11-16 10:00', '2026-11-18 10:00', '2026-11-23 10:00', '2026-11-25 10:00', '2026-11-30 10:00',
    ])
  })

  it('WEEKLY with interval 2 only uses every second week', () => {
    const zone = 'UTC'
    const series = { startAt: at('2026-11-16T10:00', zone), timezone: zone, rule: { frequency: 'WEEKLY', interval: 2, daysOfWeek: [1, 3], endsAt: null } }
    expect(local(expandOccurrences(series, at('2026-11-16T00:00', zone), at('2026-12-14T00:00', zone)), zone)).toEqual([
      '2026-11-16 10:00', '2026-11-18 10:00', '2026-11-30 10:00', '2026-12-02 10:00',
    ])
  })

  it('respects the end date (inclusive of the whole end day, nothing after)', () => {
    const zone = 'Asia/Dhaka'
    const endsAt = DateTime.fromISO('2026-11-22', { zone }).endOf('day').toJSDate()
    const series = { startAt: at('2026-11-20T09:00', zone), timezone: zone, rule: { frequency: 'DAILY', interval: 1, daysOfWeek: [], endsAt } }
    const out = expandOccurrences(series, at('2026-11-01T00:00', zone), at('2026-12-31T00:00', zone))
    expect(local(out, zone)).toEqual(['2026-11-20 09:00', '2026-11-21 09:00', '2026-11-22 09:00'])
  })

  it('never returns duplicates, even for overlapping/adjacent calls', () => {
    const zone = 'America/New_York'
    const series = { startAt: at('2026-03-01T09:00', zone), timezone: zone, rule: { frequency: 'DAILY', interval: 1, daysOfWeek: [], endsAt: null } }
    const out = expandOccurrences(series, at('2026-03-01T00:00', zone), at('2026-04-30T00:00', zone))
    expect(new Set(out.map((d) => d.getTime())).size).toBe(out.length)
    for (let i = 1; i < out.length; i++) expect(out[i] > out[i - 1]).toBe(true)
  })

  it('keeps the LOCAL time (09:00) fixed across a DST change while the UTC instant shifts', () => {
    const zone = 'America/New_York' // DST starts 2026-03-08
    const series = { startAt: at('2026-03-06T09:00', zone), timezone: zone, rule: { frequency: 'DAILY', interval: 1, daysOfWeek: [], endsAt: null } }
    const out = expandOccurrences(series, at('2026-03-06T00:00', zone), at('2026-03-10T23:59', zone))
    expect(local(out, zone).every((s) => s.endsWith('09:00'))).toBe(true)
    const utcHours = out.map((d) => d.getUTCHours())
    expect(utcHours[0]).toBe(14) // EST (UTC-5)
    expect(utcHours.at(-1)).toBe(13) // EDT (UTC-4)
  })

  it('caps huge ranges and returns [] for unsupported or empty rules', () => {
    const zone = 'UTC'
    const daily = { startAt: at('2020-01-01T09:00', zone), timezone: zone, rule: { frequency: 'DAILY', interval: 1, daysOfWeek: [], endsAt: null } }
    expect(expandOccurrences(daily, at('2020-01-01T00:00', zone), at('2030-01-01T00:00', zone)).length).toBe(MAX_OCCURRENCES)
    const monthly = { ...daily, rule: { frequency: 'MONTHLY', interval: 1, daysOfWeek: [], endsAt: null } }
    expect(expandOccurrences(monthly, at('2020-01-01T00:00', zone), at('2020-02-01T00:00', zone))).toEqual([])
    const weeklyNoDays = { ...daily, rule: { frequency: 'WEEKLY', interval: 1, daysOfWeek: [], endsAt: null } }
    expect(expandOccurrences(weeklyNoDays, at('2020-01-01T00:00', zone), at('2020-02-01T00:00', zone))).toEqual([])
  })
})

describe('parseStart (timezone handling)', () => {
  it('interprets a local wall time IN the given timezone, not as UTC', () => {
    const dt = parseStart('2026-11-20T10:00', 'Asia/Dhaka')
    expect(dt.toUTC().toISO()).toBe('2026-11-20T04:00:00.000Z') // Dhaka is UTC+6
    const ny = parseStart('2026-11-20T10:00', 'America/New_York')
    expect(ny.toUTC().toISO()).toBe('2026-11-20T15:00:00.000Z') // UTC-5 in November
  })

  it('treats a string with Z/offset as an absolute instant', () => {
    expect(parseStart('2026-11-20T04:00:00Z', 'Asia/Dhaka').toFormat('HH:mm')).toBe('10:00')
    expect(parseStart('2026-11-20T10:00:00+06:00', 'UTC').toUTC().toISO()).toBe('2026-11-20T04:00:00.000Z')
  })

  it('rejects impossible dates and malformed strings', () => {
    expect(parseStart('2026-02-30T10:00', 'UTC')).toBeNull()
    expect(parseStart('2026-13-01T10:00', 'UTC')).toBeNull()
    expect(parseStart('next tuesday', 'UTC')).toBeNull()
    expect(parseStart('2026-11-20', 'UTC')).toBeNull()
  })
})
