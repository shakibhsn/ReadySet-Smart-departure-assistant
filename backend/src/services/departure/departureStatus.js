import { DateTime } from 'luxon'

/**
 * DEPARTURE STATUS (pure). Derived ONLY from the schedule and the injected `now`.
 *
 *   now <  preparationStart             UPCOMING               preparation has not started yet
 *   preparationStart <= now < departure PREPARING              time to get ready
 *   departure <= now < targetArrival    READY_TO_LEAVE         time to leave (late if well past departure)
 *   targetArrival <= now < eventStart   ARRIVAL_TARGET_PASSED  target arrival missed, event not started
 *   now >= eventStart                   EVENT_STARTED          event has started (or is in the past)
 *
 * NOT implemented, on purpose:
 *   ON_THE_WAY  needs the user to explicitly say "I have left"; the app has no such action.
 *   COMPLETED   needs a reliable completion mechanism; the app has none.
 * Time alone cannot prove either, so they are never returned.
 *
 * Zero-length phases collapse naturally (preparation 0 skips PREPARING; buffer 0 skips
 * ARRIVAL_TARGET_PASSED). Countdown numbers are never negative.
 */

export const DEPARTURE_STATUS = Object.freeze({
  UPCOMING: 'UPCOMING',
  PREPARING: 'PREPARING',
  READY_TO_LEAVE: 'READY_TO_LEAVE',
  ARRIVAL_TARGET_PASSED: 'ARRIVAL_TARGET_PASSED',
  EVENT_STARTED: 'EVENT_STARTED',
})

const MINUTE_MS = 60_000
const clock = (date, timezone) => DateTime.fromJSDate(date, { zone: timezone }).toFormat('h:mm a')
const wholeMinutes = (ms) => Math.max(0, Math.floor(ms / MINUTE_MS))

/** "45 min", "2 h 15 min", "3 days". Never negative; under a minute reads "less than a minute". */
export function describeMinutes(totalMinutes) {
  const m = Math.max(0, Math.round(totalMinutes))
  if (m < 1) return 'less than a minute'
  if (m < 60) return `${m} min`
  if (m < 1440) {
    const h = Math.floor(m / 60)
    const rest = m % 60
    return rest ? `${h} h ${rest} min` : `${h} h`
  }
  const days = Math.floor(m / 1440)
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

const ago = (ms) => `${describeMinutes(ms / MINUTE_MS)} ago`
const inFuture = (ms) => `in ${describeMinutes(ms / MINUTE_MS)}`

/**
 * @param plan result of calculateDeparturePlan
 * @param {Date} now injected clock (tests pass a fixed value)
 */
export function getDepartureStatus(plan, now = new Date()) {
  const { timezone, preparationStart, departureTime, targetArrival, eventStart, durations } = plan
  const t = now.getTime()
  const projectedArrival = new Date(t + durations.travelDurationMinutes * MINUTE_MS)

  let status
  let nextMilestone = null
  let message

  if (t < preparationStart.getTime()) {
    status = DEPARTURE_STATUS.UPCOMING
    nextMilestone = { key: 'preparationStart', label: 'Preparation starts', at: preparationStart }
    message = `Preparation starts at ${clock(preparationStart, timezone)}, ${inFuture(preparationStart - now)}. The event starts at ${clock(eventStart, timezone)}.`
  } else if (t < departureTime.getTime()) {
    status = DEPARTURE_STATUS.PREPARING
    nextMilestone = { key: 'departureTime', label: 'Time to leave', at: departureTime }
    message = `Time to get ready (preparation began at ${clock(preparationStart, timezone)}, ${ago(now - preparationStart)}). Leave at ${clock(departureTime, timezone)}, ${inFuture(departureTime - now)}.`
  } else if (t < targetArrival.getTime()) {
    status = DEPARTURE_STATUS.READY_TO_LEAVE
    nextMilestone = { key: 'targetArrival', label: 'Target arrival', at: targetArrival }
    const late = wholeMinutes(now - departureTime)
    if (late < 1) {
      message = `It's time to leave now to arrive by ${clock(targetArrival, timezone)}.`
    } else if (projectedArrival > eventStart) {
      message = `You are ${describeMinutes(late)} past your departure time. Leaving now you would arrive around ${clock(projectedArrival, timezone)}, ${describeMinutes((projectedArrival - eventStart) / MINUTE_MS)} after the event starts.`
    } else {
      message = `You are ${describeMinutes(late)} past your departure time. Leaving now you would arrive around ${clock(projectedArrival, timezone)}, ${describeMinutes((projectedArrival - targetArrival) / MINUTE_MS)} later than planned but before the event starts.`
    }
  } else if (t < eventStart.getTime()) {
    status = DEPARTURE_STATUS.ARRIVAL_TARGET_PASSED
    nextMilestone = { key: 'eventStart', label: 'Event starts', at: eventStart }
    message =
      projectedArrival <= eventStart
        ? `Your target arrival time (${clock(targetArrival, timezone)}) has passed. The event starts at ${clock(eventStart, timezone)}, ${inFuture(eventStart - now)}. If you leave now you could still arrive around ${clock(projectedArrival, timezone)}, just before it starts.`
        : `Your target arrival time (${clock(targetArrival, timezone)}) has passed. The event starts at ${clock(eventStart, timezone)}, ${inFuture(eventStart - now)}, and with ${describeMinutes(durations.travelDurationMinutes)} of travel you would arrive after it has started.`
  } else {
    status = DEPARTURE_STATUS.EVENT_STARTED
    message = `This event started at ${clock(eventStart, timezone)}, ${ago(now - eventStart)}.`
  }

  return {
    status,
    message,
    nextMilestone: nextMilestone && { ...nextMilestone, secondsUntil: Math.max(0, Math.floor((nextMilestone.at - now) / 1000)) },
    minutesPastDeparture: t >= departureTime.getTime() ? wholeMinutes(now - departureTime) : 0,
    // Where you would be if you left right now (travel time only). Informational, not tracking.
    projectedArrival: status === DEPARTURE_STATUS.EVENT_STARTED ? null : projectedArrival,
  }
}
