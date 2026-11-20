import { prisma } from '../../config/database.js'
import { logger } from '../../utils/logger.js'
import { occurrencesOf } from '../occurrence.js'
import { GRACE_MINUTES, MIN, dueNotifications } from './notificationRules.js'

/**
 * IN-APP NOTIFICATION SWEEP (the one centralized scheduler)
 *
 * No per-user or per-event timers and no stored jobs. One sweep per minute recomputes what is due from the
 * CURRENT event data (the departure engine's times), so:
 *  - editing an event changes when reminders fire; deleting it (cascade) removes its reminders;
 *  - a restart loses nothing: reminders that became due while the server was down are still created if they
 *    are less than GRACE_MINUTES old (older ones are skipped, not sent late);
 *  - duplicates are impossible: every row has a UNIQUE dedupeKey and is inserted with skipDuplicates, so
 *    overlapping sweeps (two processes, a retry, a restart) cannot create the same reminder twice;
 *  - events are read in bounded pages (never an unbounded query), only for users with notifications enabled;
 *  - notification creation is never done inside an HTTP request: requests only read and update rows.
 */

export const SWEEP_INTERVAL_MS = 60_000
const PAGE = 200
const MAX_PAGES = 20
const RETENTION_DAYS = 90
const CLEANUP_EVERY_MS = 60 * MIN

const PREF_SELECT = { notificationsEnabled: true, notifyUpcoming: true, notifyPrep: true, notifyDeparture: true, notifyChecklist: true, notificationLeadMinutes: true }

let lastCleanup = 0

/** One sweep. Returns how many NEW notifications were inserted. */
export async function runNotificationSweep(now = new Date()) {
  // Longest possible lead: prep + travel + buffer (each <= 1440 min) before the event, plus the grace.
  const horizon = new Date(now.getTime() + (3 * 1440 + GRACE_MINUTES) * MIN)
  let cursor
  let created = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    const events = await prisma.event.findMany({
      where: {
        startAt: { lte: horizon },
        user: { preference: { notificationsEnabled: true } },
        OR: [
          { recurrenceRuleId: null, startAt: { gt: now } },
          { recurrenceRuleId: { not: null }, recurrenceRule: { OR: [{ endsAt: null }, { endsAt: { gt: now } }] } },
        ],
      },
      include: { recurrenceRule: true, exceptions: true, user: { select: { preference: { select: PREF_SELECT } } } },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    })
    if (events.length === 0) break

    const pending = await prisma.checklistItem.groupBy({ by: ['eventId'], where: { eventId: { in: events.map((e) => e.id) }, done: false }, _count: { _all: true } })
    const pendingBy = new Map(pending.map((p) => [p.eventId, p._count._all]))

    const rows = []
    for (const event of events) {
      const prefs = event.user.preference
      if (!prefs) continue
      for (const { event: occ, at: start } of occurrencesOf(event, now, horizon, { max: 10 })) { // skipped occurrences are absent, edited ones carry their own times
        for (const n of dueNotifications({ event: occ, start, prefs, pendingCount: pendingBy.get(event.id) ?? 0, now })) {
          rows.push({ userId: event.userId, eventId: event.id, type: n.type, category: n.category, title: n.title.slice(0, 150), body: n.body.slice(0, 400), occurrenceStart: start, dedupeKey: n.dedupeKey })
        }
      }
    }
    if (rows.length > 0) created += (await prisma.notification.createMany({ data: rows, skipDuplicates: true })).count

    cursor = events[events.length - 1].id
    if (events.length < PAGE) break
  }

  return created
}

/** Retention: removes notifications older than 90 days (at most once an hour). Run by the scheduler, never by a sweep. */
export async function purgeOldNotifications(now = new Date()) {
  if (now.getTime() - lastCleanup < CLEANUP_EVERY_MS) return 0
  lastCleanup = now.getTime()
  return (await prisma.notification.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - RETENTION_DAYS * 86_400_000) } } })).count
}

let timer = null
let firstTick = null
let running = false

/** Starts the single sweep timer (idempotent: calling it twice never creates a second timer). */
export function startNotificationScheduler({ intervalMs = SWEEP_INTERVAL_MS } = {}) {
  if (timer) return false
  const tick = async () => {
    if (running) return // never overlap sweeps
    running = true
    try {
      const created = await runNotificationSweep()
      await purgeOldNotifications()
      if (created > 0) logger.info('notifications.sweep', { created })
    } catch (err) {
      logger.error('notifications.sweep_failed', { code: err?.code ?? err?.name }) // a failed sweep never crashes the API
    } finally {
      running = false
    }
  }
  timer = setInterval(tick, intervalMs)
  timer.unref()
  firstTick = setTimeout(tick, 3_000)
  firstTick.unref()
  logger.info('notifications.scheduler_started', { intervalMs, graceMinutes: GRACE_MINUTES })
  return true
}

export function stopNotificationScheduler() {
  if (timer) clearInterval(timer)
  if (firstTick) clearTimeout(firstTick)
  timer = null
  firstTick = null
}
