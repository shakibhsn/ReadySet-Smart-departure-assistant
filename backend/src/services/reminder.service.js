import { prisma } from '../config/database.js'
import { emailConfig } from '../config/email.config.js'
import { logger } from '../utils/logger.js'
import { eventReminderTemplate } from '../templates/eventReminderTemplate.js'
import { queueEmail } from './email/emailService.js'
import { calculateDeparturePlan, resolveTimezone } from './departure/departureCalculator.js'
import { expandOccurrences } from './recurrence.service.js'

/**
 * EMAIL REMINDERS (upcoming event / start preparing / time to leave)
 *
 * Design: there are NO stored jobs. A sweep runs every minute (see startReminderScheduler) and
 * recomputes what is due from the CURRENT event data, so:
 *  - editing an event's time/travel/preparation automatically changes when reminders fire;
 *  - deleted events produce nothing (they are not in the database any more);
 *  - a server restart loses nothing: reminders that became due while the server was down are still
 *    sent if they are less than GRACE_MINUTES old (older ones are skipped, not sent late);
 *  - recurring events are expanded only inside a short look-ahead window, so no infinite jobs exist;
 *  - duplicates are impossible because every reminder has a unique dedupeKey (event id + occurrence
 *    instant + kind) enforced by the database, even if two server processes sweep at once.
 *
 * Formulas (same as the frontend):
 *   Target Arrival    = Event Time     - Arrival Buffer
 *   Departure Time    = Target Arrival - Travel Time
 *   Preparation Start = Departure Time - Preparation Time
 */

export const UPCOMING_LEAD_MINUTES = 60
export const GRACE_MINUTES = 30
export const SWEEP_INTERVAL_MS = 60_000
const MIN = 60_000

export function departurePlan(event, start) {
  // Single source of truth: the departure calculator. (Kept returning the short names the reminders use.)
  const p = calculateDeparturePlan({
    startAt: start,
    timezone: resolveTimezone(event.timezone), // events always have one; the shared fallback chain covers partial objects
    travelDurationMinutes: event.travelDurationMinutes,
    preparationMinutes: event.preparationMinutes,
    arrivalBufferMinutes: event.arrivalBufferMinutes,
  })
  return { targetArrival: p.targetArrival, departure: p.departureTime, prepStart: p.preparationStart }
}

/**
 * Which reminders are due right now for one occurrence?
 * A reminder is due when its send time has passed, is not older than the grace window,
 * and the event has not started yet (never remind about an event that is already over).
 */
export function dueReminders(event, start, prefs, now = new Date()) {
  if (now >= start) return []
  const plan = departurePlan(event, start)
  const candidates = [
    prefs.emailUpcomingReminders && { kind: 'upcoming', sendAt: new Date(start.getTime() - UPCOMING_LEAD_MINUTES * MIN) },
    prefs.emailPrepReminders && { kind: 'prep', sendAt: plan.prepStart },
    prefs.emailDepartureReminders && { kind: 'departure', sendAt: plan.departure },
  ].filter(Boolean)
  return candidates.filter(({ sendAt }) => sendAt <= now && now - sendAt <= GRACE_MINUTES * MIN).map((c) => c.kind)
}

const clock = (date, timeZone) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone })
    .format(date)
    .replace(/\s+/g, ' ')

/** One sweep. Returns how many reminder emails were queued. */
export async function runReminderSweep(now = new Date()) {
  // Only verified addresses receive reminders, and only users who opted in to at least one type.
  const users = await prisma.user.findMany({
    where: {
      emailVerifiedAt: { not: null },
      preference: { OR: [{ emailUpcomingReminders: true }, { emailPrepReminders: true }, { emailDepartureReminders: true }] },
    },
    select: {
      id: true,
      name: true,
      email: true,
      preference: { select: { emailUpcomingReminders: true, emailPrepReminders: true, emailDepartureReminders: true } },
    },
  })

  // Longest possible lead: prep + travel + buffer (each <= 1440 min) before the event, plus the grace.
  const horizon = new Date(now.getTime() + (3 * 1440 + GRACE_MINUTES) * MIN)
  let queued = 0

  for (const user of users) {
    const events = await prisma.event.findMany({
      where: {
        userId: user.id,
        startAt: { lte: horizon },
        OR: [
          { recurrenceRuleId: null, startAt: { gt: now } },
          { recurrenceRuleId: { not: null }, recurrenceRule: { OR: [{ endsAt: null }, { endsAt: { gt: now } }] } },
        ],
      },
      include: { recurrenceRule: true },
      take: 200,
    })

    for (const event of events) {
      const occurrences = expandOccurrences({ startAt: event.startAt, timezone: event.timezone, rule: event.recurrenceRule }, now, horizon, { max: 10 })
      for (const start of occurrences) {
        for (const kind of dueReminders(event, start, user.preference, now)) {
          const plan = departurePlan(event, start)
          queueEmail({
            type: `EVENT_REMINDER_${kind.toUpperCase()}`,
            to: user.email,
            userId: user.id,
            dedupeKey: `reminder:${event.id}:${start.toISOString()}:${kind}`,
            template: eventReminderTemplate({
              name: user.name,
              kind,
              event,
              times: {
                start: clock(start, event.timezone),
                targetArrival: clock(plan.targetArrival, event.timezone),
                departure: clock(plan.departure, event.timezone),
                prepStart: clock(plan.prepStart, event.timezone),
              },
              url: `${emailConfig.appBaseUrl}/events/${event.id}`,
            }),
          })
          queued++
        }
      }
    }
  }
  return queued
}

let timer = null
let running = false

/** Starts the minute-by-minute sweep. Disabled unless EMAIL_REMINDERS_ENABLED=true. */
export function startReminderScheduler() {
  if (!emailConfig.remindersEnabled || timer) return false
  const tick = async () => {
    if (running) return // never overlap sweeps
    running = true
    try {
      const queued = await runReminderSweep()
      if (queued > 0) logger.info('reminders.sweep', { candidates: queued }) // duplicates are skipped later by the dedupe key
    } catch (err) {
      logger.error('reminders.sweep_failed', { code: err?.code ?? err?.name })
    } finally {
      running = false
    }
  }
  timer = setInterval(tick, SWEEP_INTERVAL_MS)
  timer.unref()
  setTimeout(tick, 5_000).unref()
  logger.info('reminders.scheduler_started', { intervalMs: SWEEP_INTERVAL_MS, graceMinutes: GRACE_MINUTES })
  return true
}

export function stopReminderScheduler() {
  if (timer) clearInterval(timer)
  timer = null
}
