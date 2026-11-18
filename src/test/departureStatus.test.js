import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNow } from '@/hooks/useNow'
import { deriveReadiness, splitSeconds, timelineProgress } from '@/utils/departureStatus'
import { planStartingIn } from './planFixture'

const MIN = 60_000
// A fixed event: starts at T, prep 30, travel 35, buffer 10  ->  prepStart T-75, leave T-45, arrive T-10
const T0 = Date.parse('2026-11-20T04:00:00.000Z') // 10:00 in Asia/Dhaka
const view = planStartingIn(T0 - 3 * 60 * MIN, 180) // event starts exactly at T0
const at = (minutesFromStart) => new Date(T0 + minutesFromStart * MIN)

describe('deriveReadiness (local status from backend timestamps)', () => {
  it('mirrors the backend rules at every boundary', () => {
    expect(deriveReadiness(view, at(-76)).status).toBe('UPCOMING')
    expect(deriveReadiness(view, at(-75)).status).toBe('PREPARING') // prep starts at T-75
    expect(deriveReadiness(view, at(-46)).status).toBe('PREPARING')
    expect(deriveReadiness(view, at(-45)).status).toBe('READY_TO_LEAVE') // leave at T-45
    expect(deriveReadiness(view, at(-11)).status).toBe('READY_TO_LEAVE')
    expect(deriveReadiness(view, at(-10)).status).toBe('ARRIVAL_TARGET_PASSED') // arrive by T-10
    expect(deriveReadiness(view, at(-1)).status).toBe('ARRIVAL_TARGET_PASSED')
    expect(deriveReadiness(view, at(0)).status).toBe('EVENT_STARTED')
    expect(deriveReadiness(view, at(500)).status).toBe('EVENT_STARTED')
  })

  it('points the countdown at the NEXT milestone', () => {
    expect(deriveReadiness(view, at(-80)).nextMilestone).toMatchObject({ key: 'preparationStart', secondsUntil: 5 * 60 })
    expect(deriveReadiness(view, at(-60)).nextMilestone).toMatchObject({ key: 'departureTime', secondsUntil: 15 * 60 })
    expect(deriveReadiness(view, at(-30)).nextMilestone).toMatchObject({ key: 'targetArrival', secondsUntil: 20 * 60 })
    expect(deriveReadiness(view, at(-5)).nextMilestone).toMatchObject({ key: 'eventStart', secondsUntil: 5 * 60 })
    expect(deriveReadiness(view, at(5)).nextMilestone).toBeNull()
  })

  it('never produces a negative countdown, at any time', () => {
    for (let m = -600; m <= 600; m += 3) {
      const r = deriveReadiness(view, new Date(T0 + m * MIN + 777))
      if (r.nextMilestone) expect(r.nextMilestone.secondsUntil).toBeGreaterThanOrEqual(0)
    }
  })

  it('does not depend on the browser timezone (only on ISO timestamps)', () => {
    const a = deriveReadiness(view, at(-60))
    const asString = JSON.stringify(a)
    expect(asString).toContain('2026-11-20T03:15:00.000Z') // departure time as an absolute instant
  })
})

describe('timelineProgress', () => {
  it('marks reached steps and highlights the latest one', () => {
    const steps = (m) => timelineProgress(view, at(m)).map((s) => `${s.done ? 'x' : '-'}${s.current ? '*' : ''}`)
    expect(steps(-100)).toEqual(['-', '-', '-', '-'])
    expect(steps(-60)).toEqual(['x*', '-', '-', '-'])
    expect(steps(-30)).toEqual(['x', 'x*', '-', '-'])
    expect(steps(-5)).toEqual(['x', 'x', 'x*', '-'])
    expect(steps(5)).toEqual(['x', 'x', 'x', 'x']) // event started: everything done, nothing "current"
  })
})

describe('splitSeconds', () => {
  it('splits into days / hours / minutes / seconds and clamps negatives', () => {
    expect(splitSeconds(0)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 })
    expect(splitSeconds(3 * 3600 + 15 * 60 + 9)).toEqual({ days: 0, hours: 3, minutes: 15, seconds: 9 })
    expect(splitSeconds(2 * 86400 + 5)).toEqual({ days: 2, hours: 0, minutes: 0, seconds: 5 })
    expect(splitSeconds(-50)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  })
})

describe('useNow (one timer, paused when hidden, instant catch-up)', () => {
  const setHidden = (hidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-20T08:00:00Z'))
  })
  afterEach(() => {
    setHidden(false)
    vi.useRealTimers()
  })

  it('ticks once per interval from the real clock and cleans up on unmount', () => {
    const { result, unmount } = renderHook(() => useNow(1000))
    expect(vi.getTimerCount()).toBe(1) // exactly one interval
    const start = result.current.getTime()
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.getTime()).toBe(start + 3000)
    unmount()
    expect(vi.getTimerCount()).toBe(0) // no leaked interval
  })

  it('stops ticking while the tab is hidden and catches up IMMEDIATELY when it becomes visible', () => {
    const { result } = renderHook(() => useNow(1000))
    act(() => vi.advanceTimersByTime(2000))
    act(() => setHidden(true))
    expect(vi.getTimerCount()).toBe(0) // paused: no wasted work in a background tab
    const frozen = result.current.getTime()
    act(() => vi.advanceTimersByTime(60_000)) // a minute passes in the background
    expect(result.current.getTime()).toBe(frozen)

    act(() => setHidden(false))
    expect(result.current.getTime()).toBe(Date.now()) // instantly correct, computed from the real clock
    expect(result.current.getTime()).toBe(frozen + 60_000)
    expect(vi.getTimerCount()).toBe(1) // exactly one interval again
  })
})
