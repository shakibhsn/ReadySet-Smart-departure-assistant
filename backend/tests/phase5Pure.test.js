import { describe, expect, it } from 'vitest'
import { average, bucketsFor, buildAnalytics, rate, workloadByDay } from '../src/services/analytics/analyticsRules.js'

const D = (s) => new Date(s)
const NOW = D('2030-05-20T12:00:00.000Z')
const base = { from: D('2030-05-06T00:00:00.000Z'), to: D('2030-05-27T00:00:00.000Z'), timezone: 'UTC', granularity: 'week', now: NOW }
const occ = (id, start, prep = 30) => ({ eventId: id, start: D(start), originalStart: D(start), preparationMinutes: prep })
const log = (eventId, start, { prepMin = 30, lateMin = 0, cancelled = false, left = true } = {}) => {
  const s = D(start)
  const prepStartedAt = new Date(s.getTime() - 90 * 60_000)
  return { eventId, occurrenceStart: s, plannedDepartureAt: new Date(s.getTime() - 30 * 60_000), prepStartedAt, readyAt: new Date(prepStartedAt.getTime() + prepMin * 60_000), cancelledAt: cancelled ? new Date() : null, leftAt: left ? new Date(s.getTime() - 30 * 60_000 + lateMin * 60_000) : null }
}

describe('rate / average never show a number from too little data', () => {
  it('needs at least 3 data points', () => {
    expect(rate(1, 1)).toMatchObject({ status: 'insufficient_data', samples: 1, needed: 3 })
    expect(rate(0, 0).status).toBe('insufficient_data')
    expect(rate(2, 4)).toMatchObject({ status: 'ok', percent: 50, count: 2, of: 4 })
    expect(average([10, 20]).status).toBe('insufficient_data')
    expect(average([10, 20, 30])).toMatchObject({ status: 'ok', minutes: 20, samples: 3 })
  })
})

describe('buckets', () => {
  it('weeks start on Monday in the user timezone and cover the whole range', () => {
    const b = bucketsFor(D('2030-05-08T00:00:00Z'), D('2030-05-22T00:00:00Z'), 'UTC', 'week')
    expect(b.map((x) => x.key)).toEqual(['2030-05-06', '2030-05-13', '2030-05-20'])
    expect(b[0].end).toEqual(b[1].start)
  })
  it('months, and a hard cap on the number of buckets', () => {
    expect(bucketsFor(D('2030-01-15T00:00:00Z'), D('2030-03-02T00:00:00Z'), 'UTC', 'month').map((x) => x.key)).toEqual(['2030-01-01', '2030-02-01', '2030-03-01'])
    expect(bucketsFor(D('2000-01-01T00:00:00Z'), D('2030-01-01T00:00:00Z'), 'UTC', 'week').length).toBeLessThanOrEqual(60)
  })
})

describe('buildAnalytics: real numbers from real rows', () => {
  const occurrences = [occ('a', '2030-05-07T09:00:00Z'), occ('b', '2030-05-08T09:00:00Z'), occ('c', '2030-05-09T09:00:00Z'), occ('d', '2030-05-14T09:00:00Z'), occ('future', '2030-05-25T09:00:00Z')]
  const logs = [log('a', '2030-05-07T09:00:00Z', { prepMin: 20, lateMin: 0 }), log('b', '2030-05-08T09:00:00Z', { prepMin: 30, lateMin: 12 }), log('c', '2030-05-09T09:00:00Z', { prepMin: 40, lateMin: -10 })]
  const items = [{ eventId: 'a', done: true }, { eventId: 'a', done: true }, { eventId: 'b', done: false }, { eventId: 'c', done: true }]
  const r = buildAnalytics({ ...base, occurrences, logs, items })

  it('counts past, upcoming and completed preparations', () => {
    expect(r.totals).toEqual({ scheduled: 5, past: 4, upcoming: 1 })
    expect(r.preparation.completion).toMatchObject({ status: 'ok', count: 3, of: 4, percent: 75 })
    expect(r.preparation.average).toMatchObject({ status: 'ok', minutes: 30 })
  })
  it('on-time: early counts as on time, more than 5 minutes late does not', () => {
    expect(r.departure.onTime).toMatchObject({ status: 'ok', count: 2, of: 3, percent: 67 })
  })
  it('checklist rate is done / total for the events in range', () => {
    expect(r.checklist).toMatchObject({ totalItems: 4, doneItems: 3, rate: { status: 'ok', percent: 75 } })
  })
  it('trend has one entry per week; weeks without enough data say so (not 0%)', () => {
    expect(r.trend.map((t) => t.events)).toEqual([3, 1, 1])
    expect(r.trend[0].averagePrep).toMatchObject({ status: 'ok', minutes: 30 })
    expect(r.trend[1].averagePrep.status).toBe('insufficient_data')
    expect(r.trend[2].onTime.status).toBe('insufficient_data')
  })
  it('cancelled and unfinished sessions are not counted as completed or in the average', () => {
    const rr = buildAnalytics({ ...base, occurrences, logs: [...logs.slice(0, 2), log('c', '2030-05-09T09:00:00Z', { cancelled: true })], items })
    expect(rr.preparation.completion).toMatchObject({ count: 2, of: 4 })
    expect(rr.preparation.average.status).toBe('insufficient_data')
  })
  it('a brand-new user: no events, no numbers, explicit empty state', () => {
    const e = buildAnalytics({ ...base, occurrences: [], logs: [], items: [] })
    expect(e.hasEvents).toBe(false)
    expect(e.totals).toEqual({ scheduled: 0, past: 0, upcoming: 0 })
    expect(e.preparation.completion.status).toBe('insufficient_data')
    expect(e.checklist.rate.status).toBe('insufficient_data')
  })
  it('when preparation tracking is unavailable it is reported as unavailable, never as zero', () => {
    const u = buildAnalytics({ ...base, occurrences, logs: [], items, preparationAvailable: false })
    expect(u.preparationTracking).toBe('unavailable')
    expect(u.preparation).toBeNull()
    expect(u.departure).toBeNull()
    expect(u.checklist.rate.status).toBe('ok')
  })
})

describe('workload', () => {
  it('sums preparation minutes per local day', () => {
    const days = [{ date: '2030-05-06' }, { date: '2030-05-07' }]
    const out = workloadByDay(days, [{ localDate: '2030-05-06', preparationMinutes: 30 }, { localDate: '2030-05-06', preparationMinutes: 45 }])
    expect(out).toEqual([{ date: '2030-05-06', minutes: 75, events: 2 }, { date: '2030-05-07', minutes: 0, events: 0 }])
  })
})
