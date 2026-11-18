const MIN = 60_000

export const time12 = (d, tz) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).format(d).replace(/\s+/g, ' ')
const dateKey = (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const localPart = (d, tz) => ({ date: dateKey(d, tz), time12: time12(d, tz) })

/**
 * Builds a backend-shaped departure plan view for tests (same fields as the real API; the message
 * text is simplified). `event` needs timezone + the three durations; `startIso` is the occurrence
 * start; `nowMs` is the moment the "server" calculated it.
 */
export function fakePlanView(event, startIso, nowMs) {
  const tz = event.timezone
  const start = new Date(startIso)
  const target = new Date(start.getTime() - event.arrivalBufferMinutes * MIN)
  const leave = new Date(target.getTime() - event.travelDurationMinutes * MIN)
  const prep = new Date(leave.getTime() - event.preparationMinutes * MIN)
  const t = nowMs
  const status = t < prep ? 'UPCOMING' : t < leave ? 'PREPARING' : t < target ? 'READY_TO_LEAVE' : t < start ? 'ARRIVAL_TARGET_PASSED' : 'EVENT_STARTED'
  const next = {
    UPCOMING: ['preparationStart', 'Preparation starts', prep],
    PREPARING: ['departureTime', 'Time to leave', leave],
    READY_TO_LEAVE: ['targetArrival', 'Target arrival', target],
    ARRIVAL_TARGET_PASSED: ['eventStart', 'Event starts', start],
  }[status]

  return {
    event: {
      id: event.id ?? null,
      title: event.title ?? null,
      category: event.category ?? null,
      destination: event.destination ?? null,
      startAt: start.toISOString(),
      timezone: tz,
      isRecurring: Boolean(event.isRecurring),
    },
    plan: { preparationStart: prep.toISOString(), departureTime: leave.toISOString(), targetArrival: target.toISOString(), eventStart: start.toISOString() },
    local: { timezone: tz, preparationStart: localPart(prep, tz), departureTime: localPart(leave, tz), targetArrival: localPart(target, tz), eventStart: localPart(start, tz) },
    durations: {
      preparationMinutes: event.preparationMinutes,
      travelDurationMinutes: event.travelDurationMinutes,
      arrivalBufferMinutes: event.arrivalBufferMinutes,
      totalRequiredMinutes: event.preparationMinutes + event.travelDurationMinutes + event.arrivalBufferMinutes,
    },
    status,
    readiness: {
      message: `Server message for ${status}`,
      nextMilestone: next ? { key: next[0], label: next[1], at: next[2].toISOString(), secondsUntil: Math.max(0, Math.floor((next[2] - t) / 1000)) } : null,
      minutesPastDeparture: Math.max(0, Math.floor((t - leave) / MIN)),
      projectedArrival: null,
    },
    explanation: `Start preparing at ${time12(prep, tz)} and leave at ${time12(leave, tz)} to arrive ${event.arrivalBufferMinutes} minutes before your event.`,
    calculatedAt: new Date(t).toISOString(),
  }
}

/** Convenience: a plan for an event that starts `startsInMinutes` from `nowMs` (negative = already started). */
export function planStartingIn(nowMs, startsInMinutes, overrides = {}) {
  const event = {
    id: 'evt-1', title: 'Algorithms Midterm', category: 'university', destination: 'Hall B', timezone: 'Asia/Dhaka',
    preparationMinutes: 30, travelDurationMinutes: 35, arrivalBufferMinutes: 10, isRecurring: false,
    ...overrides,
  }
  return fakePlanView(event, new Date(nowMs + startsInMinutes * MIN).toISOString(), nowMs)
}
