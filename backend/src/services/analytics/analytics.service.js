import { DateTime } from 'luxon'
import { prisma, supportsField } from '../../config/database.js'
import { logger } from '../../utils/logger.js'
import { getConflicts } from '../conflict/conflict.service.js'
import { calculateDeparturePlan, resolveTimezone } from '../departure/departureCalculator.js'
import { listOccurrenceRecords } from '../event.service.js'
import { buildAnalytics, workloadByDay } from './analyticsRules.js'

// Read-only. Every query is scoped by the userId from the verified JWT and bounded (range cap, row caps).

const timezoneOf = async (userId) => (await prisma.userPreference.findUnique({ where: { userId }, select: { timezone: true } }))?.timezone ?? 'UTC'
const MAX_LOGS = 2000
const MAX_ITEMS = 5000

export async function getAnalytics(userId, { from, to, granularity = 'week' } = {}, now = new Date()) {
  const timezone = await timezoneOf(userId)
  const today = DateTime.fromJSDate(now, { zone: timezone }).startOf('day')
  const end = (to ? DateTime.fromISO(to, { zone: timezone }) : today).startOf('day').plus({ days: 1 }) // inclusive end day
  const start = from ? DateTime.fromISO(from, { zone: timezone }).startOf('day') : end.minus({ days: 28 })
  const fromDate = start.toJSDate()
  const toDate = end.toJSDate()

  const records = await listOccurrenceRecords(userId, fromDate, toDate)
  const occurrences = records.filter(({ at }) => at >= fromDate && at < toDate).map(({ event, at, originalStart }) => ({ eventId: event.id, start: at, originalStart, preparationMinutes: event.preparationMinutes }))

  // Preparation logs exist only after the Phase 3 migration: without them the metrics are reported as unavailable, never as zero.
  let logs = []
  let preparationAvailable = true
  try {
    logs = await prisma.preparationLog.findMany({ where: { userId, occurrenceStart: { gte: fromDate, lt: toDate } }, take: MAX_LOGS })
  } catch (err) {
    preparationAvailable = false
    logger.warn('analytics.prep_unavailable', { code: err?.code ?? err?.name })
  }

  const eventIds = [...new Set(occurrences.map((o) => o.eventId))]
  const withCompleted = supportsField('ChecklistItem', 'completedAt')
  const items = eventIds.length
    ? await prisma.checklistItem.findMany({ where: { userId, eventId: { in: eventIds } }, select: { eventId: true, done: true, ...(withCompleted && { completedAt: true }) }, take: MAX_ITEMS })
    : []
  const completedInRange = withCompleted ? items.filter((i) => i.completedAt && i.completedAt >= fromDate && i.completedAt < toDate).length : null

  return buildAnalytics({ occurrences, logs, items, from: fromDate, to: toDate, timezone, granularity, now, preparationAvailable, completedInRange })
}

/** The weekly planner: 7 local days (Monday first) with events, priority, conflict flags and preparation workload. */
export async function getWeek(userId, { start } = {}, now = new Date()) {
  const timezone = await timezoneOf(userId)
  const base = start ? DateTime.fromISO(start, { zone: timezone }) : DateTime.fromJSDate(now, { zone: timezone })
  const weekStart = base.startOf('week')
  const weekEnd = weekStart.plus({ days: 7 })

  const [records, conflicts, upcomingRecords] = await Promise.all([
    listOccurrenceRecords(userId, weekStart.toJSDate(), weekEnd.toJSDate()),
    getConflicts(userId, { from: weekStart.toJSDate(), days: 7 }, now),
    listOccurrenceRecords(userId, now, new Date(now.getTime() + 14 * 86_400_000)),
  ])
  const conflicted = new Set(conflicts.conflicts.flatMap((c) => c.events.map((e) => e.eventId)))

  const present = (event, at) => {
    const zone = resolveTimezone(event.timezone)
    const plan = calculateDeparturePlan({ startAt: at, timezone: zone, travelDurationMinutes: event.travelDurationMinutes, preparationMinutes: event.preparationMinutes, arrivalBufferMinutes: event.arrivalBufferMinutes })
    const local = (d) => DateTime.fromJSDate(d, { zone })
    return {
      id: event.id,
      title: event.title,
      category: event.category,
      priority: event.priority ?? 'normal',
      startAt: at.toISOString(),
      timezone: event.timezone,
      localDate: local(at).toFormat('yyyy-MM-dd'),
      startTime: local(at).toFormat('h:mm a'),
      preparationStartTime: local(plan.preparationStart).toFormat('h:mm a'),
      departureTime: local(plan.departureTime).toFormat('h:mm a'),
      preparationMinutes: event.preparationMinutes,
      hasConflict: conflicted.has(event.id),
      isPast: at < now,
    }
  }

  const items = records.filter(({ at }) => at >= weekStart.toJSDate() && at < weekEnd.toJSDate()).map(({ event, at }) => present(event, at))
  const nowLocal = DateTime.fromJSDate(now, { zone: timezone })
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = weekStart.plus({ days: i })
    return { date: d.toFormat('yyyy-MM-dd'), label: d.toFormat('ccc d LLL'), isToday: d.hasSame(nowLocal, 'day') }
  })
  const workload = workloadByDay(days, items)
  const busiest = [...workload].sort((a, b) => b.minutes - a.minutes)[0]

  return {
    weekStart: days[0].date,
    weekEnd: days[6].date,
    timezone,
    days: days.map((d, i) => ({ ...d, events: items.filter((e) => e.localDate === d.date), workloadMinutes: workload[i].minutes })),
    summary: { events: items.length, conflicts: conflicts.conflicts.length, workloadMinutes: workload.reduce((s, w) => s + w.minutes, 0), busiestDay: busiest && busiest.minutes > 0 ? busiest.date : null, highPriority: items.filter((e) => e.priority === 'high').length },
    conflictAssumptions: conflicts.assumptions,
    upcoming: upcomingRecords.slice(0, 5).map(({ event, at }) => present(event, at)),
  }
}
