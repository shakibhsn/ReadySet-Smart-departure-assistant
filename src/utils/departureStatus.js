/**
 * Live readiness from a backend plan's TIMESTAMPS (no network, no formatted strings).
 *
 * The backend calculates the plan and its status as of `calculatedAt`. As the clock moves the
 * status can advance (UPCOMING -> PREPARING -> ...), so the UI re-derives it locally from the same
 * ISO timestamps. The rules mirror backend/src/services/departure/departureStatus.js.
 * Countdown values are never negative.
 */

export const STATUS_META = {
  UPCOMING: { label: 'Upcoming', tone: 'info' },
  PREPARING: { label: 'Time to get ready', tone: 'info' },
  READY_TO_LEAVE: { label: 'Time to leave', tone: 'warn' },
  ARRIVAL_TARGET_PASSED: { label: 'Target arrival passed', tone: 'late' },
  EVENT_STARTED: { label: 'Event started', tone: 'late' },
}

const ms = (iso) => new Date(iso).getTime()

/** @param view a plan object from the API; @param {Date} now */
export function deriveReadiness(view, now = new Date()) {
  const t = now.getTime()
  const { preparationStart, departureTime, targetArrival, eventStart } = view.plan
  const next = (key, label, at) => ({ key, label, at, secondsUntil: Math.max(0, Math.floor((ms(at) - t) / 1000)) })

  if (t < ms(preparationStart)) return { status: 'UPCOMING', nextMilestone: next('preparationStart', 'Preparation starts', preparationStart) }
  if (t < ms(departureTime)) return { status: 'PREPARING', nextMilestone: next('departureTime', 'Time to leave', departureTime) }
  if (t < ms(targetArrival)) return { status: 'READY_TO_LEAVE', nextMilestone: next('targetArrival', 'Target arrival', targetArrival) }
  if (t < ms(eventStart)) return { status: 'ARRIVAL_TARGET_PASSED', nextMilestone: next('eventStart', 'Event starts', eventStart) }
  return { status: 'EVENT_STARTED', nextMilestone: null }
}

/** Which of the four timeline steps are done / current, for the visual timeline. */
export function timelineProgress(view, now = new Date()) {
  const t = now.getTime()
  const order = ['preparationStart', 'departureTime', 'targetArrival', 'eventStart']
  const passed = order.map((key) => t >= ms(view.plan[key]))
  const current = passed.lastIndexOf(true) // -1 = nothing reached yet
  return order.map((key, i) => ({ key, done: passed[i], current: i === current && i < order.length - 1 }))
}

export function splitSeconds(total) {
  const s = Math.max(0, Math.floor(total))
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 }
}
