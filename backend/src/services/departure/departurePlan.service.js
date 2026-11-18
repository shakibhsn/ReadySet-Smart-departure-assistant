import { DateTime } from 'luxon'
import { prisma } from '../../config/database.js'
import { AppError } from '../../utils/apiResponse.js'
import { DEFAULT_TIMEZONE, parseStart } from '../../utils/timezone.js'
import { findOwnedEvent, listOccurrenceRecords, seriesOf } from '../event.service.js'
import { expandOccurrences } from '../recurrence.service.js'
import { DepartureInputError, calculateDeparturePlan, localizePlan, resolveDurations, resolveTimezone } from './departureCalculator.js'
import { describeMinutes, getDepartureStatus } from './departureStatus.js'

/**
 * Departure plans for real, user-owned events. Every query is scoped by the userId from the verified
 * JWT. Calculation and status come from the pure modules next to this file; this file only loads
 * data, shapes responses, and turns bad input into HTTP errors.
 */

const MAX_LEAD_MINUTES = 3 * 1440 // preparation + travel + buffer can each be up to 1440 minutes
const NEXT_OCCURRENCE_HORIZON_DAYS = 366

const toHttpError = (err) => {
  if (err instanceof DepartureInputError) return new AppError(400, 'Validation failed', [{ field: err.field, message: err.message }])
  return err
}

async function getUserContext(userId) {
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: { timezone: true, defaultPreparationMinutes: true, defaultArrivalBufferMinutes: true },
  })
  return { timezone: pref?.timezone ?? null, preferences: pref ?? {} }
}

const minutesWord = (n) => (n < 60 ? `${n} ${n === 1 ? 'minute' : 'minutes'}` : describeMinutes(n))

/** "8:45 AM", or "11:30 PM (the day before)" when the milestone falls on another local day than the event. */
function clockWithDay(parts, eventDate) {
  if (parts.date === eventDate) return parts.time12
  const days = Math.round(DateTime.fromISO(eventDate).diff(DateTime.fromISO(parts.date), 'days').days)
  if (days === 1) return `${parts.time12} (the day before)`
  if (days === -1) return `${parts.time12} (the day after)`
  return `${parts.time12} (${Math.abs(days)} days ${days > 0 ? 'before' : 'after'})`
}

function buildExplanation(plan, local) {
  const { arrivalBufferMinutes, preparationMinutes } = plan.durations
  const leave = clockWithDay(local.departureTime, local.eventStart.date)
  const arrive = arrivalBufferMinutes > 0 ? `to arrive ${minutesWord(arrivalBufferMinutes)} before your event` : 'to arrive when your event starts'
  if (preparationMinutes === 0) return `Leave at ${leave} ${arrive}. No preparation time is set.`
  return `Start preparing at ${clockWithDay(local.preparationStart, local.eventStart.date)} and leave at ${leave} ${arrive}.`
}

/** Consistent API shape for one plan. `event` is null-ish for previews. */
export function buildPlanView({ event, plan, now }) {
  const local = localizePlan(plan)
  const readiness = getDepartureStatus(plan, now)
  return {
    event: {
      id: event?.id ?? null,
      title: event?.title ?? null,
      category: event?.category ?? null,
      destination: event?.destination ?? null,
      startAt: plan.eventStart.toISOString(), // this occurrence's start
      timezone: plan.timezone,
      isRecurring: Boolean(event?.isRecurring),
    },
    plan: {
      preparationStart: plan.preparationStart.toISOString(),
      departureTime: plan.departureTime.toISOString(),
      targetArrival: plan.targetArrival.toISOString(),
      eventStart: plan.eventStart.toISOString(),
    },
    local, // the same milestones as local clock times in the event's timezone
    durations: plan.durations,
    status: readiness.status,
    readiness: {
      message: readiness.message,
      nextMilestone: readiness.nextMilestone && {
        key: readiness.nextMilestone.key,
        label: readiness.nextMilestone.label,
        at: readiness.nextMilestone.at.toISOString(),
        secondsUntil: readiness.nextMilestone.secondsUntil, // never negative
      },
      minutesPastDeparture: readiness.minutesPastDeparture,
      projectedArrival: readiness.projectedArrival?.toISOString() ?? null,
    },
    explanation: buildExplanation(plan, local),
    calculatedAt: now.toISOString(),
  }
}

/** Plan for one stored event row at one occurrence instant, using the event's own saved values. */
function planForEvent(event, start) {
  try {
    return calculateDeparturePlan({
      startAt: start,
      timezone: resolveTimezone(event.timezone),
      travelDurationMinutes: event.travelDurationMinutes,
      preparationMinutes: event.preparationMinutes,
      arrivalBufferMinutes: event.arrivalBufferMinutes,
    })
  } catch (err) {
    throw toHttpError(err)
  }
}

const byDeparture = (a, b) => a.plan.departureTime - b.plan.departureTime || a.event.id.localeCompare(b.event.id)

// ---------- single saved event ----------

export async function getEventDeparturePlan(userId, eventId, { occurrence } = {}, now = new Date()) {
  const event = await findOwnedEvent(userId, eventId) // 404 for missing OR someone else's event

  let start = event.startAt
  if (event.isRecurring) {
    const series = seriesOf(event)
    if (occurrence) {
      const wanted = new Date(occurrence)
      const [exact] = expandOccurrences(series, wanted, wanted, { max: 1 })
      if (!exact || exact.getTime() !== wanted.getTime()) {
        throw new AppError(400, 'Validation failed', [{ field: 'occurrence', message: 'Not an occurrence of this event' }])
      }
      start = exact
    } else {
      // Default: the next occurrence from now; if the series has ended, its first occurrence.
      const horizon = new Date(now.getTime() + NEXT_OCCURRENCE_HORIZON_DAYS * 86_400_000)
      start = expandOccurrences(series, now, horizon, { max: 1 })[0] ?? event.startAt
    }
  } else if (occurrence && new Date(occurrence).getTime() !== event.startAt.getTime()) {
    throw new AppError(400, 'Validation failed', [{ field: 'occurrence', message: 'Not an occurrence of this event' }])
  }

  return buildPlanView({ event, plan: planForEvent(event, start), now })
}

// ---------- preview (never touches the database writes) ----------

export async function previewDeparturePlan(userId, input, now = new Date()) {
  const { timezone: userTimezone, preferences } = await getUserContext(userId)
  const timezone = resolveTimezone(input.timezone, userTimezone) // explicit > user preference > Asia/Dhaka
  const start = parseStart(input.startAt, timezone)
  if (!start) throw new AppError(400, 'Validation failed', [{ field: 'startAt', message: 'Not a valid date and time' }])
  try {
    const durations = resolveDurations(input, preferences)
    const plan = calculateDeparturePlan({ startAt: start.toJSDate(), timezone, ...durations })
    return buildPlanView({ event: null, plan, now })
  } catch (err) {
    throw toHttpError(err)
  }
}

// ---------- today / upcoming ----------

/**
 * Plans that are relevant on the user's current LOCAL day: the event starts today (or is already
 * running) and its preparation begins before today ends. An event at 00:30 whose preparation starts
 * at 22:30 the evening before is therefore shown on both days' boundaries correctly.
 */
export async function getTodayPlans(userId, { timezone } = {}, now = new Date()) {
  const { timezone: userTimezone } = await getUserContext(userId)
  const zone = resolveTimezone(timezone, userTimezone, DEFAULT_TIMEZONE)
  const dayStart = DateTime.fromJSDate(now, { zone }).startOf('day')
  const dayEnd = dayStart.plus({ days: 1 })

  const records = await listOccurrenceRecords(userId, dayStart.toJSDate(), new Date(dayEnd.toMillis() + MAX_LEAD_MINUTES * 60_000))
  const plans = records
    .map(({ event, at }) => ({ event, plan: planForEvent(event, at) }))
    .filter(({ plan }) => plan.eventStart >= dayStart.toJSDate() && plan.preparationStart < dayEnd.toJSDate())
    .sort(byDeparture)
    .map(({ event, plan }) => buildPlanView({ event, plan, now }))

  return { date: dayStart.toFormat('yyyy-MM-dd'), timezone: zone, plans }
}

export async function getUpcomingPlans(userId, { days, limit }, now = new Date()) {
  const to = new Date(now.getTime() + days * 86_400_000)
  const records = await listOccurrenceRecords(userId, now, to) // recurring series expanded once per occurrence
  const plans = records
    .map(({ event, at }) => ({ event, plan: planForEvent(event, at) }))
    .sort(byDeparture)
    .slice(0, limit)
    .map(({ event, plan }) => buildPlanView({ event, plan, now }))
  return { from: now.toISOString(), to: to.toISOString(), plans }
}
