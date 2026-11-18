import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import {
  APP_DEFAULTS,
  DepartureInputError,
  calculateDeparturePlan,
  localizePlan,
  resolveDurations,
  resolveTimezone,
} from '../src/services/departure/departureCalculator.js'
import { DEPARTURE_STATUS, describeMinutes, getDepartureStatus } from '../src/services/departure/departureStatus.js'
import { previewDepartureSchema } from '../src/services/departure/departureValidation.js'

/** A real instant from a local wall time in a zone. */
const at = (local, zone) => DateTime.fromISO(local, { zone }).toJSDate()
const DHAKA = 'Asia/Dhaka'

function plan(overrides = {}) {
  return calculateDeparturePlan({
    startAt: at('2026-11-20T10:00', DHAKA),
    timezone: DHAKA,
    travelDurationMinutes: 35,
    preparationMinutes: 30,
    arrivalBufferMinutes: 10,
    ...overrides,
  })
}
const times = (p) => {
  const l = localizePlan(p)
  return { prep: l.preparationStart.time12, leave: l.departureTime.time12, arrive: l.targetArrival.time12, start: l.eventStart.time12 }
}

describe('calculator: required examples', () => {
  it('Test 1: 10:00 AM, travel 35, buffer 10, preparation 30 -> 8:45 / 9:15 / 9:50 / 10:00', () => {
    const p = plan()
    expect(times(p)).toEqual({ prep: '8:45 AM', leave: '9:15 AM', arrive: '9:50 AM', start: '10:00 AM' })
    expect(p.durations).toEqual({ preparationMinutes: 30, travelDurationMinutes: 35, arrivalBufferMinutes: 10, totalRequiredMinutes: 75 })
    // exact absolute instants (10:00 Dhaka = 04:00Z)
    expect(p.eventStart.toISOString()).toBe('2026-11-20T04:00:00.000Z')
    expect(p.targetArrival.toISOString()).toBe('2026-11-20T03:50:00.000Z')
    expect(p.departureTime.toISOString()).toBe('2026-11-20T03:15:00.000Z')
    expect(p.preparationStart.toISOString()).toBe('2026-11-20T02:45:00.000Z')
  })

  // NOTE: the original spec listed "12:00 PM / 12:45 PM / 2:45 PM" for travel 60. Those values are
  // arithmetically inconsistent with the formulas: 3:00 - 15 = 2:45 (arrival), 2:45 - 60 = 1:45
  // (departure), 1:45 - 45 = 1:00 (preparation). The spec's times correspond to travel = 120.
  it('Test 2: 3:00 PM, travel 60, buffer 15, preparation 45 -> 1:00 PM / 1:45 PM / 2:45 PM (formula-correct)', () => {
    const p = plan({ startAt: at('2026-11-20T15:00', DHAKA), travelDurationMinutes: 60, arrivalBufferMinutes: 15, preparationMinutes: 45 })
    expect(times(p)).toEqual({ prep: '1:00 PM', leave: '1:45 PM', arrive: '2:45 PM', start: '3:00 PM' })
    expect(p.durations.totalRequiredMinutes).toBe(120)
  })

  it('Test 2b: the spec times 12:00 PM / 12:45 PM / 2:45 PM are reproduced with travel = 120 min', () => {
    const p = plan({ startAt: at('2026-11-20T15:00', DHAKA), travelDurationMinutes: 120, arrivalBufferMinutes: 15, preparationMinutes: 45 })
    expect(times(p)).toEqual({ prep: '12:00 PM', leave: '12:45 PM', arrive: '2:45 PM', start: '3:00 PM' })
    expect(p.durations.totalRequiredMinutes).toBe(180)
  })

  it('Test 3: an event just after midnight rolls the preparation start back to the previous day', () => {
    const p = plan({ startAt: at('2026-11-21T00:10', DHAKA) }) // 00:10 on the 21st
    const l = localizePlan(p)
    expect(l.eventStart.date).toBe('2026-11-21')
    expect(l.targetArrival).toMatchObject({ date: '2026-11-21', time: '00:00' })
    expect(l.departureTime).toMatchObject({ date: '2026-11-20', time: '23:25' })
    expect(l.preparationStart).toMatchObject({ date: '2026-11-20', time: '22:55' })
  })

  it('Test 3b: an event late in the evening stays on the same date', () => {
    const l = localizePlan(plan({ startAt: at('2026-11-20T23:59', DHAKA), preparationMinutes: 0, travelDurationMinutes: 5, arrivalBufferMinutes: 0 }))
    expect(l.departureTime).toMatchObject({ date: '2026-11-20', time: '23:54' })
  })

  it('Test 4: an event in another timezone keeps correct local display and absolute instants', () => {
    const ny = 'America/New_York' // UTC-5 in November
    const p = plan({ startAt: at('2026-11-20T10:00', ny), timezone: ny })
    const l = localizePlan(p)
    expect(p.eventStart.toISOString()).toBe('2026-11-20T15:00:00.000Z')
    expect(p.preparationStart.toISOString()).toBe('2026-11-20T13:45:00.000Z')
    expect(times(p)).toEqual({ prep: '8:45 AM', leave: '9:15 AM', arrive: '9:50 AM', start: '10:00 AM' })
    expect(l.eventStart.iso).toMatch(/T10:00:00\.000-05:00$/)
    // the same instants read very differently in Dhaka: proof the display depends on the event zone
    expect(DateTime.fromJSDate(p.eventStart, { zone: DHAKA }).toFormat('HH:mm')).toBe('21:00')
  })

  it('a local time is never reinterpreted as UTC: same wall time in two zones = different instants', () => {
    const a = plan({ startAt: at('2026-11-20T10:00', DHAKA) })
    const b = plan({ startAt: at('2026-11-20T10:00', 'Europe/London'), timezone: 'Europe/London' })
    expect(a.eventStart.getTime()).not.toBe(b.eventStart.getTime())
    expect(b.eventStart.toISOString()).toBe('2026-11-20T10:00:00.000Z') // London is UTC in November
  })
})

describe('calculator: daylight saving', () => {
  const ny = 'America/New_York'

  it('subtracts ELAPSED minutes across the spring-forward gap (02:00 -> 03:00 on 2026-03-08)', () => {
    // 03:30 EDT == 07:30Z. 60 elapsed minutes earlier is 06:30Z == 01:30 EST (wall clock jumped 2 hours).
    const p = calculateDeparturePlan({ startAt: at('2026-03-08T03:30', ny), timezone: ny, travelDurationMinutes: 0, preparationMinutes: 60, arrivalBufferMinutes: 0 })
    expect(p.eventStart.toISOString()).toBe('2026-03-08T07:30:00.000Z')
    expect(p.preparationStart.toISOString()).toBe('2026-03-08T06:30:00.000Z')
    expect(p.eventStart - p.preparationStart).toBe(60 * 60_000)
    expect(localizePlan(p).preparationStart.time).toBe('01:30')
    expect(localizePlan(p).eventStart.time).toBe('03:30')
  })

  it('handles the fall-back overlap (01:30 happens twice on 2026-11-01) without losing an hour', () => {
    // 02:00 EST on Nov 1 == 07:00Z. 90 elapsed minutes earlier is 05:30Z == 01:30 EDT (the FIRST 01:30).
    const p = calculateDeparturePlan({ startAt: at('2026-11-01T02:00', ny), timezone: ny, travelDurationMinutes: 0, preparationMinutes: 90, arrivalBufferMinutes: 0 })
    expect(p.preparationStart.toISOString()).toBe('2026-11-01T05:30:00.000Z')
    expect(p.eventStart - p.preparationStart).toBe(90 * 60_000)
    expect(localizePlan(p).preparationStart.iso).toMatch(/-04:00$/) // still daylight time at that instant
  })
})

describe('status engine', () => {
  const p = plan() // prep 8:45, leave 9:15, arrive 9:50, start 10:00 (Dhaka)
  const nowAt = (hhmm, day = '2026-11-20') => at(`${day}T${hhmm}`, DHAKA)

  it('several hours away -> UPCOMING with a countdown to the preparation start', () => {
    const s = getDepartureStatus(p, nowAt('05:30'))
    expect(s.status).toBe(DEPARTURE_STATUS.UPCOMING)
    expect(s.nextMilestone).toMatchObject({ key: 'preparationStart', secondsUntil: 3 * 3600 + 15 * 60 })
    expect(s.message).toBe('Preparation starts at 8:45 AM, in 3 h 15 min. The event starts at 10:00 AM.')
    expect(s.minutesPastDeparture).toBe(0)
  })

  it('Test 5: preparation start already passed -> PREPARING and says so', () => {
    const s = getDepartureStatus(p, nowAt('08:50'))
    expect(s.status).toBe(DEPARTURE_STATUS.PREPARING)
    expect(s.nextMilestone).toMatchObject({ key: 'departureTime', secondsUntil: 25 * 60 })
    expect(s.message).toContain('preparation began at 8:45 AM, 5 min ago')
    expect(s.message).toContain('Leave at 9:15 AM, in 25 min')
  })

  it('Test 6a: just past departure -> READY_TO_LEAVE, late but still before the event starts', () => {
    const s = getDepartureStatus(p, nowAt('09:25'))
    expect(s.status).toBe(DEPARTURE_STATUS.READY_TO_LEAVE)
    expect(s.minutesPastDeparture).toBe(10)
    expect(s.message).toBe('You are 10 min past your departure time. Leaving now you would arrive around 10:00 AM, 10 min later than planned but before the event starts.')
    expect(s.projectedArrival.toISOString()).toBe(at('2026-11-20T10:00', DHAKA).toISOString())
  })

  it('Test 6b: well past departure -> warns that leaving now means arriving after the event starts', () => {
    const s = getDepartureStatus(p, nowAt('09:40'))
    expect(s.status).toBe(DEPARTURE_STATUS.READY_TO_LEAVE)
    expect(s.message).toContain('25 min past your departure time')
    expect(s.message).toContain('15 min after the event starts')
  })

  it('exactly at departure time: ready to leave, not late', () => {
    const s = getDepartureStatus(p, nowAt('09:15'))
    expect(s.status).toBe(DEPARTURE_STATUS.READY_TO_LEAVE)
    expect(s.message).toBe("It's time to leave now to arrive by 9:50 AM.")
  })

  it('Test 7: target arrival passed -> ARRIVAL_TARGET_PASSED with an honest assessment', () => {
    const s = getDepartureStatus(p, nowAt('09:55'))
    expect(s.status).toBe(DEPARTURE_STATUS.ARRIVAL_TARGET_PASSED)
    expect(s.nextMilestone).toMatchObject({ key: 'eventStart', secondsUntil: 5 * 60 })
    expect(s.message).toContain('target arrival time (9:50 AM) has passed')
    expect(s.message).toContain('you would arrive after it has started') // 35 min of travel > 5 min left
  })

  it('Test 8: event started -> EVENT_STARTED, no milestone, no countdown', () => {
    const s = getDepartureStatus(p, nowAt('10:05'))
    expect(s.status).toBe(DEPARTURE_STATUS.EVENT_STARTED)
    expect(s.nextMilestone).toBeNull()
    expect(s.projectedArrival).toBeNull()
    expect(s.message).toBe('This event started at 10:00 AM, 5 min ago.')
  })

  it('an event long in the past still reports EVENT_STARTED with a readable age', () => {
    const s = getDepartureStatus(p, nowAt('10:00', '2026-11-23'))
    expect(s.status).toBe(DEPARTURE_STATUS.EVENT_STARTED)
    expect(s.message).toBe('This event started at 10:00 AM, 3 days ago.')
  })

  it('milestone boundaries are inclusive at the start of each phase', () => {
    expect(getDepartureStatus(p, nowAt('08:44')).status).toBe('UPCOMING')
    expect(getDepartureStatus(p, nowAt('08:45')).status).toBe('PREPARING')
    expect(getDepartureStatus(p, nowAt('09:14')).status).toBe('PREPARING')
    expect(getDepartureStatus(p, nowAt('09:15')).status).toBe('READY_TO_LEAVE')
    expect(getDepartureStatus(p, nowAt('09:49')).status).toBe('READY_TO_LEAVE')
    expect(getDepartureStatus(p, nowAt('09:50')).status).toBe('ARRIVAL_TARGET_PASSED')
    expect(getDepartureStatus(p, nowAt('09:59')).status).toBe('ARRIVAL_TARGET_PASSED')
    expect(getDepartureStatus(p, nowAt('10:00')).status).toBe('EVENT_STARTED')
  })

  it('never returns a negative countdown at any moment, before or after the event', () => {
    for (let minute = -400; minute <= 400; minute += 7) {
      const s = getDepartureStatus(p, new Date(p.eventStart.getTime() + minute * 60_000 + 13_000))
      if (s.nextMilestone) expect(s.nextMilestone.secondsUntil).toBeGreaterThanOrEqual(0)
      expect(s.minutesPastDeparture).toBeGreaterThanOrEqual(0)
      expect(s.message).not.toMatch(/-\d/)
    }
  })

  it('zero-length phases collapse: no preparation skips PREPARING, no buffer skips ARRIVAL_TARGET_PASSED', () => {
    const noPrep = plan({ preparationMinutes: 0 })
    expect(getDepartureStatus(noPrep, nowAt('09:14')).status).toBe('UPCOMING')
    expect(getDepartureStatus(noPrep, nowAt('09:15')).status).toBe('READY_TO_LEAVE')
    const noBuffer = plan({ arrivalBufferMinutes: 0 })
    expect(getDepartureStatus(noBuffer, nowAt('09:59')).status).toBe('READY_TO_LEAVE')
    expect(getDepartureStatus(noBuffer, nowAt('10:00')).status).toBe('EVENT_STARTED')
  })

  it('is deterministic: the injected clock fully decides the result', () => {
    const now = nowAt('09:00')
    expect(getDepartureStatus(p, now)).toEqual(getDepartureStatus(p, new Date(now)))
  })

  it('times in messages use the EVENT timezone, not the server timezone', () => {
    const ny = 'America/New_York'
    const pn = plan({ startAt: at('2026-11-20T10:00', ny), timezone: ny })
    const s = getDepartureStatus(pn, at('2026-11-20T08:50', ny))
    expect(s.message).toContain('preparation began at 8:45 AM')
  })

  it('describeMinutes is human friendly and never negative', () => {
    expect(describeMinutes(0)).toBe('less than a minute')
    expect(describeMinutes(-5)).toBe('less than a minute')
    expect(describeMinutes(45)).toBe('45 min')
    expect(describeMinutes(60)).toBe('1 h')
    expect(describeMinutes(135)).toBe('2 h 15 min')
    expect(describeMinutes(1440)).toBe('1 day')
    expect(describeMinutes(4320)).toBe('3 days')
  })

  it('never reports ON_THE_WAY or COMPLETED (the app has no way to know)', () => {
    expect(Object.keys(DEPARTURE_STATUS)).not.toContain('ON_THE_WAY')
    expect(Object.keys(DEPARTURE_STATUS)).not.toContain('COMPLETED')
  })
})

describe('validation', () => {
  const bad = (overrides, field) => {
    try {
      plan(overrides)
    } catch (err) {
      expect(err).toBeInstanceOf(DepartureInputError)
      expect(err.field).toBe(field)
      return
    }
    throw new Error(`expected a DepartureInputError for ${field}`)
  }

  it('Test 9: rejects negative, fractional, non-numeric and absurd durations', () => {
    bad({ travelDurationMinutes: -1 }, 'travelDurationMinutes')
    bad({ preparationMinutes: -5 }, 'preparationMinutes')
    bad({ arrivalBufferMinutes: -10 }, 'arrivalBufferMinutes')
    bad({ travelDurationMinutes: 12.5 }, 'travelDurationMinutes')
    bad({ preparationMinutes: '30' }, 'preparationMinutes')
    bad({ travelDurationMinutes: NaN }, 'travelDurationMinutes')
    bad({ preparationMinutes: 99999 }, 'preparationMinutes')
    bad({ startAt: new Date('nope') }, 'startAt')
    bad({ startAt: '2026-11-20T10:00' }, 'startAt') // a string is not an instant
    bad({ timezone: 'Mars/Phobos' }, 'timezone')
  })

  it('accepts zero for preparation, buffer and (in the calculator) travel', () => {
    const p = plan({ preparationMinutes: 0, arrivalBufferMinutes: 0, travelDurationMinutes: 0 })
    expect(p.preparationStart.getTime()).toBe(p.eventStart.getTime())
    expect(p.durations.totalRequiredMinutes).toBe(0)
  })

  it('the preview schema applies the same rules at the API boundary', () => {
    const ok = { startAt: '2026-11-20T10:00', travelDurationMinutes: 35 }
    expect(previewDepartureSchema.safeParse(ok).success).toBe(true)
    for (const patch of [
      { travelDurationMinutes: -1 },
      { travelDurationMinutes: 0 },
      { travelDurationMinutes: 1.5 },
      { travelDurationMinutes: '35' },
      { travelDurationMinutes: 5000 },
      { preparationMinutes: -1 },
      { arrivalBufferMinutes: -1 },
      { startAt: 'tomorrow' },
      { startAt: undefined },
      { timezone: 'Nope/Zone' },
      { userId: 'x' }, // unknown fields are rejected
    ]) {
      expect(previewDepartureSchema.safeParse({ ...ok, ...patch }).success, JSON.stringify(patch)).toBe(false)
    }
  })
})

describe('fallbacks', () => {
  it('Test 10: a missing/invalid timezone falls back to the user zone, then to Asia/Dhaka', () => {
    expect(resolveTimezone(undefined, null, 'Not/AZone')).toBe('Asia/Dhaka')
    expect(resolveTimezone(undefined, 'America/New_York')).toBe('America/New_York')
    expect(resolveTimezone('Europe/London', 'America/New_York')).toBe('Europe/London') // explicit wins
    expect(resolveTimezone()).toBe('Asia/Dhaka')
  })

  it('durations: explicit value > user preference > application default (and 0 counts as explicit)', () => {
    const prefs = { defaultPreparationMinutes: 45, defaultArrivalBufferMinutes: 20 }
    expect(resolveDurations({ travelDurationMinutes: 30, preparationMinutes: 10, arrivalBufferMinutes: 5 }, prefs)).toEqual({ travelDurationMinutes: 30, preparationMinutes: 10, arrivalBufferMinutes: 5 })
    expect(resolveDurations({ travelDurationMinutes: 30 }, prefs)).toEqual({ travelDurationMinutes: 30, preparationMinutes: 45, arrivalBufferMinutes: 20 })
    expect(resolveDurations({ travelDurationMinutes: 30 }, {})).toEqual({ travelDurationMinutes: 30, ...APP_DEFAULTS })
    expect(resolveDurations({ travelDurationMinutes: 30, preparationMinutes: 0, arrivalBufferMinutes: 0 }, prefs)).toMatchObject({ preparationMinutes: 0, arrivalBufferMinutes: 0 })
  })

  it('travel time has no fallback: it must be supplied', () => {
    expect(() => resolveDurations({}, { defaultPreparationMinutes: 30 })).toThrow(DepartureInputError)
  })
})
