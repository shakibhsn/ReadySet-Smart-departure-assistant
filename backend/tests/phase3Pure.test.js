import { describe, expect, it } from 'vitest'
import { adviceFor, pickHour, THRESHOLDS } from '../src/services/weather/weatherHelpers.js'
import { describeWeatherCode } from '../src/services/weather/weatherCodes.js'
import { actualPrepMinutes, applyAction, buildProfile, confidenceFor, latenessMinutes, MIN_SAMPLES, oftenUnchecked, percentile, suggestBuffer, suggestPrep, weeklySummary } from '../src/services/prep/prepRules.js'

// Pure: no database, no network.
const D = (s) => new Date(s)
const T0 = D('2030-05-10T08:00:00Z')
const plus = (min) => new Date(T0.getTime() + min * 60_000)

describe('tap state machine (server timestamps, valid sequences, idempotent)', () => {
  it('start -> ready -> left records each once and repeated taps change nothing', () => {
    let log = {}
    let r = applyAction(log, 'start', plus(0))
    expect(r).toEqual({ changed: true, patch: { prepStartedAt: plus(0), cancelledAt: null } })
    log = { ...log, ...r.patch }
    expect(applyAction(log, 'start', plus(5))).toEqual({ changed: false, patch: {} }) // repeat tap
    r = applyAction(log, 'ready', plus(30))
    log = { ...log, ...r.patch }
    expect(log.readyAt).toEqual(plus(30))
    expect(applyAction(log, 'ready', plus(40))).toEqual({ changed: false, patch: {} })
    r = applyAction(log, 'left', plus(45))
    log = { ...log, ...r.patch }
    expect(applyAction(log, 'left', plus(50)).changed).toBe(false)
    expect(log.leftAt).toEqual(plus(45))
  })
  it('rejects invalid sequences', () => {
    expect(applyAction({}, 'ready', plus(1)).error).toMatch(/Start preparing/)
    expect(applyAction({}, 'cancel', plus(1)).error).toMatch(/not started/)
    expect(applyAction({ prepStartedAt: plus(0), leftAt: plus(10) }, 'ready', plus(20)).error).toMatch(/already left/)
    expect(applyAction({ leftAt: plus(10) }, 'start', plus(20)).error).toMatch(/already left/)
    expect(applyAction({ prepStartedAt: plus(0), readyAt: plus(10) }, 'cancel', plus(20)).error).toMatch(/already finished/)
    expect(applyAction({ prepStartedAt: plus(10) }, 'ready', plus(10)).error).toMatch(/after the start/)
    expect(applyAction({}, 'dance', plus(1)).error).toBe('Unknown action.')
  })
  it('a cancelled session can be restarted, and is excluded from durations', () => {
    const cancelled = { prepStartedAt: plus(0), cancelledAt: plus(5) }
    expect(applyAction(cancelled, 'ready', plus(30)).error).toMatch(/Start preparing/)
    expect(applyAction(cancelled, 'start', plus(10))).toEqual({ changed: true, patch: { prepStartedAt: plus(10), cancelledAt: null } })
    expect(actualPrepMinutes({ prepStartedAt: plus(0), readyAt: plus(30), cancelledAt: plus(31) })).toBeNull()
  })
})

describe('what counts as reliable data', () => {
  it('actual preparation needs start AND ready, plausible length, not cancelled', () => {
    expect(actualPrepMinutes({ prepStartedAt: plus(0), readyAt: plus(35) })).toBe(35)
    expect(actualPrepMinutes({ prepStartedAt: plus(0) })).toBeNull() // incomplete
    expect(actualPrepMinutes({ prepStartedAt: plus(0), readyAt: plus(1) })).toBeNull() // < 2 min: accidental tap
    expect(actualPrepMinutes({ prepStartedAt: plus(0), readyAt: plus(600) })).toBeNull() // > 8 h: forgotten tap
  })
  it('early departure is NOT lateness (it counts as 0); late is minutes after plan; implausible is ignored', () => {
    const planned = plus(100)
    expect(latenessMinutes({ plannedDepartureAt: planned, leftAt: plus(90) })).toBe(0)
    expect(latenessMinutes({ plannedDepartureAt: planned, leftAt: plus(100) })).toBe(0)
    expect(latenessMinutes({ plannedDepartureAt: planned, leftAt: plus(112) })).toBe(12)
    expect(latenessMinutes({ plannedDepartureAt: planned, leftAt: plus(100 + 300) })).toBeNull()
    expect(latenessMinutes({ plannedDepartureAt: planned })).toBeNull()
  })
})

describe('recommendations: transparent rules, confidence, graceful with no history', () => {
  it('uses nearest-rank percentiles', () => {
    expect(percentile([10, 20, 30, 40], 75)).toBe(30)
    expect(percentile([10, 20, 30, 40], 50)).toBe(20)
    expect(percentile([7], 75)).toBe(7)
  })
  it('new users (fewer than 3 samples) get an explanation, never a number', () => {
    for (const s of [suggestPrep([]), suggestPrep([30, 40]), suggestBuffer([5, 10], 10)]) {
      expect(s).toMatchObject({ status: 'insufficient_data', needed: MIN_SAMPLES })
      expect(s).not.toHaveProperty('minutes')
      expect(s.message).toMatch(/Not enough history/)
    }
  })
  it('prep suggestion = 75th percentile rounded up to 5 min, with samples, median and explanation', () => {
    const s = suggestPrep([32, 40, 38, 45, 36]) // sorted 32 36 38 40 45 -> p75 = 40
    expect(s).toMatchObject({ status: 'ok', minutes: 40, samples: 5, medianMinutes: 38, confidence: 'medium' })
    expect(s.explanation).toMatch(/75th percentile \(40 min\)/)
    expect(suggestPrep([31, 31, 31]).minutes).toBe(35) // rounded UP
  })
  it('confidence: 3-4 low, 5-9 medium, 10+ high, and a wide spread lowers it one level', () => {
    expect(confidenceFor([30, 31, 32])).toBe('low')
    expect(confidenceFor([30, 31, 32, 30, 31])).toBe('medium')
    expect(confidenceFor(Array.from({ length: 10 }, (_, i) => 30 + (i % 3)))).toBe('high')
    expect(confidenceFor([10, 60, 20, 90, 15, 70, 25, 80, 12, 85])).toBe('medium') // erratic: high -> medium
  })
  it('buffer formula: current buffer + min(30, p75 lateness rounded up to 5); on time -> +0', () => {
    expect(suggestBuffer([0, 12, 7, 20, 3], 10)).toMatchObject({ status: 'ok', minutes: 25, extraMinutes: 15, currentBuffer: 10, lateDepartures: 3 }) // sorted 0 3 7 12 20 -> p75 = 12 -> rounded up 15
  })
  it('buffer extra is capped at 30 minutes and never negative; early leavers get no extra', () => {
    expect(suggestBuffer([100, 120, 90, 150], 10).extraMinutes).toBe(30)
    const early = suggestBuffer([0, 0, 0, 0], 10)
    expect(early).toMatchObject({ extraMinutes: 0, minutes: 10 })
  })
  it('only the last 20 samples are used', () => {
    const twentyOne = [...Array.from({ length: 20 }, () => 30), 600]
    expect(suggestPrep(twentyOne).samples).toBe(20)
  })
})

describe('buildProfile and weekly summary', () => {
  const log = (daysAgo, over = {}) => ({ category: 'office', occurrenceStart: new Date(T0.getTime() - daysAgo * 86_400_000), plannedPrepMinutes: 30, plannedDepartureAt: new Date(T0.getTime() - daysAgo * 86_400_000), prepStartedAt: new Date(T0.getTime() - daysAgo * 86_400_000 - 40 * 60_000), readyAt: new Date(T0.getTime() - daysAgo * 86_400_000 - 5 * 60_000), leftAt: new Date(T0.getTime() - daysAgo * 86_400_000 + 8 * 60_000), uncheckedItems: [], ...over })

  it('per-category and overall suggestions, buffer from departures, ignoring incomplete/cancelled logs', () => {
    const logs = [log(1), log(2), log(3), log(4, { category: 'gym' }), log(5, { readyAt: null }), log(6, { cancelledAt: T0 })]
    const p = buildProfile({ logs, defaultBuffer: 10, now: T0 })
    expect(p.preparation.byCategory.office).toMatchObject({ status: 'ok', samples: 3, minutes: 35 })
    expect(p.preparation.byCategory.gym.status).toBe('insufficient_data')
    expect(p.preparation.overall.samples).toBe(4) // the incomplete and the cancelled session were excluded
    expect(p.buffer).toMatchObject({ status: 'ok', extraMinutes: 10, minutes: 20 })
  })
  it('a brand new user gets an empty but valid profile', () => {
    const p = buildProfile({ logs: [], now: T0 })
    expect(p.preparation.overall.status).toBe('insufficient_data')
    expect(p.preparation.byCategory).toEqual({})
    expect(p.weekly).toMatchObject({ eventsLogged: 0, avgActualPrepMinutes: null })
    expect(p.weekly.message).toMatch(/No activity logged/)
  })
  it('weekly summary covers only the last 7 days, with on-time rate and items left unchecked', () => {
    const logs = [log(1, { uncheckedItems: ['Charger'] }), log(2, { uncheckedItems: ['Charger', 'Keys'] }), log(10)]
    const w = weeklySummary(logs, T0)
    expect(w).toMatchObject({ eventsLogged: 2, preparationsMeasured: 2, avgPlannedPrepMinutes: 30, avgActualPrepMinutes: 35, departuresLogged: 2, onTimeDepartures: 0 })
    expect(w.uncheckedWhenLeaving[0]).toEqual({ name: 'Charger', times: 2 })
  })
  it('often-unchecked needs 2+ departures and is not called "forgotten"', () => {
    expect(oftenUnchecked([log(1, { uncheckedItems: ['Keys'] }), log(2, { uncheckedItems: ['keys ', 'Towel'] })])).toEqual([{ name: 'Keys', times: 2 }])
  })
})

describe('weather advice (information only)', () => {
  const f = (over = {}) => ({ temperatureC: 22, condition: 'Clear sky', icon: 'clear', severeCondition: false, rainChancePercent: 10, windSpeedKmh: 8, ...over })
  const ids = (x) => adviceFor(x).map((a) => a.id)

  it('no advice for pleasant weather or missing data', () => {
    expect(ids(f())).toEqual([])
    expect(ids(f({ temperatureC: null, rainChancePercent: null, windSpeedKmh: null }))).toEqual([])
    expect(adviceFor(null)).toEqual([])
  })
  it('rain: probability threshold or a rain forecast', () => {
    expect(ids(f({ rainChancePercent: THRESHOLDS.rainChancePercent }))).toEqual(['RAIN'])
    expect(ids(f({ rainChancePercent: 49 }))).toEqual([])
    expect(adviceFor(f({ rainChancePercent: 60 }))[0].message).toMatch(/umbrella/)
    expect(ids(f({ icon: 'drizzle', rainChancePercent: null }))).toEqual(['RAIN'])
  })
  it('heat and cold thresholds', () => {
    expect(adviceFor(f({ temperatureC: 33 }))[0]).toMatchObject({ id: 'HEAT', severity: 'info' })
    expect(adviceFor(f({ temperatureC: 33 }))[0].message).toMatch(/water/)
    expect(ids(f({ temperatureC: 31 }))).toEqual([])
    expect(adviceFor(f({ temperatureC: 10 }))[0].message).toMatch(/warm clothing/)
    expect(ids(f({ temperatureC: 11 }))).toEqual([])
  })
  it('severe conditions or strong wind produce a WARNING first', () => {
    const storm = adviceFor(f({ icon: 'thunder', condition: 'Thunderstorm', severeCondition: true, rainChancePercent: 80 }))
    expect(storm.map((a) => a.id)).toEqual(['SEVERE', 'RAIN'])
    expect(storm[0].severity).toBe('warning')
    expect(adviceFor(f({ windSpeedKmh: 55 }))[0]).toMatchObject({ id: 'SEVERE', severity: 'warning' })
    expect(ids(f({ windSpeedKmh: 49 }))).toEqual([])
  })
  it('weather codes know which conditions are severe, and pickHour carries it', () => {
    expect(describeWeatherCode(95).severe).toBe(true)
    expect(describeWeatherCode(82).severe).toBe(true)
    expect(describeWeatherCode(61).severe).toBe(false)
    const body = { utc_offset_seconds: 21600, hourly: { time: ['2030-05-10T10:00'], temperature_2m: [24], weather_code: [95], precipitation_probability: [90], wind_speed_10m: [20] } }
    expect(pickHour(body, D('2030-05-10T04:00:00Z'))).toMatchObject({ severeCondition: true, icon: 'thunder' })
  })
})
