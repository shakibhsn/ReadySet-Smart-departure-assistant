import { describe, expect, it } from 'vitest'
import { prisma } from '../src/config/database.js'
import { GRACE_MINUTES, departurePlan, dueReminders, runReminderSweep } from '../src/services/reminder.service.js'
import { flushEmails, mailbox, registerAndLogin } from './helpers.js'

const MIN = 60_000
const event = { arrivalBufferMinutes: 10, travelDurationMinutes: 35, preparationMinutes: 30 }
const allOn = { emailUpcomingReminders: true, emailPrepReminders: true, emailDepartureReminders: true }
const lead = event.arrivalBufferMinutes + event.travelDurationMinutes + event.preparationMinutes // 75 min

describe('departure maths (same formulas as the frontend)', () => {
  it('Target = start - buffer, Departure = target - travel, Prep start = departure - prep', () => {
    const start = new Date('2026-11-20T10:00:00Z')
    const plan = departurePlan(event, start)
    expect(plan.targetArrival.toISOString()).toBe('2026-11-20T09:50:00.000Z')
    expect(plan.departure.toISOString()).toBe('2026-11-20T09:15:00.000Z')
    expect(plan.prepStart.toISOString()).toBe('2026-11-20T08:45:00.000Z')
  })
})

describe('dueReminders (pure rules)', () => {
  const start = new Date('2026-11-20T10:00:00Z')
  const at = (iso) => new Date(iso)

  it('fires each reminder at its own time (preparation 08:45, departure 09:15, upcoming 09:00)', () => {
    expect(dueReminders(event, start, allOn, at('2026-11-20T08:44:00Z'))).toEqual([])
    expect(dueReminders(event, start, allOn, at('2026-11-20T08:45:30Z'))).toEqual(['prep'])
    expect(dueReminders(event, start, allOn, at('2026-11-20T09:00:30Z')).sort()).toEqual(['prep', 'upcoming'])
    // at 09:15:30 the preparation reminder (08:45) is already older than the grace window
    expect(dueReminders(event, start, allOn, at('2026-11-20T09:15:30Z')).sort()).toEqual(['departure', 'upcoming'])
  })

  it('respects notification preferences', () => {
    const only = { emailUpcomingReminders: false, emailPrepReminders: false, emailDepartureReminders: true }
    expect(dueReminders(event, start, only, at('2026-11-20T09:15:30Z'))).toEqual(['departure'])
    expect(dueReminders(event, start, { emailUpcomingReminders: false, emailPrepReminders: false, emailDepartureReminders: false }, at('2026-11-20T09:15:30Z'))).toEqual([])
  })

  it('never reminds about an event that has started or is over', () => {
    expect(dueReminders(event, start, allOn, at('2026-11-20T10:00:00Z'))).toEqual([])
    expect(dueReminders(event, start, allOn, at('2026-11-20T11:00:00Z'))).toEqual([])
  })

  it('catches up after downtime within the grace window but never sends a stale reminder', () => {
    const justInsideGrace = new Date(new Date('2026-11-20T08:45:00Z').getTime() + (GRACE_MINUTES - 1) * MIN)
    expect(dueReminders(event, start, { ...allOn, emailUpcomingReminders: false, emailDepartureReminders: false }, justInsideGrace)).toEqual(['prep'])
    const tooLate = new Date(new Date('2026-11-20T08:45:00Z').getTime() + (GRACE_MINUTES + 1) * MIN)
    expect(dueReminders(event, start, { ...allOn, emailUpcomingReminders: false, emailDepartureReminders: false }, tooLate)).toEqual([])
  })
})

describe('runReminderSweep (database + mock provider)', () => {
  async function verifiedUser(prefs = allOn) {
    const reg = await registerAndLogin()
    await prisma.user.update({ where: { id: reg.user.id }, data: { emailVerifiedAt: new Date() } })
    await prisma.userPreference.update({ where: { userId: reg.user.id }, data: prefs })
    mailbox.reset()
    return reg
  }
  /** An event whose PREPARATION reminder is due ~1 minute ago. */
  const dueEvent = (userId, overrides = {}) =>
    prisma.event.create({
      data: {
        userId, title: 'Algorithms Midterm', category: 'university', timezone: 'Asia/Dhaka', destination: 'Hall B',
        startAt: new Date(Date.now() + (lead - 1) * MIN), travelDurationMinutes: 35, preparationMinutes: 30, arrivalBufferMinutes: 10,
        ...overrides,
      },
    })
  const sweep = async () => {
    const queued = await runReminderSweep()
    await flushEmails()
    return queued
  }

  it('sends the preparation reminder once, in the event timezone, and never duplicates it', async () => {
    const { user, body } = await verifiedUser({ ...allOn, emailUpcomingReminders: false, emailDepartureReminders: false })
    await dueEvent(user.id)
    expect(await sweep()).toBe(1)
    expect(mailbox.sent).toHaveLength(1)
    const mail = mailbox.sent[0]
    expect(mail.to).toBe(body.email)
    expect(mail.subject).toContain('Time to start getting ready for Algorithms Midterm')
    expect(mail.text).toContain('Timezone: Asia/Dhaka')
    expect(mail.text).toContain('Hall B')

    await sweep() // next minute: same reminder is still "due" but must not be sent again
    await sweep()
    expect(mailbox.sent).toHaveLength(1)
    const logs = await prisma.emailLog.findMany({ where: { userId: user.id, emailType: 'EVENT_REMINDER_PREP' } })
    expect(logs).toHaveLength(1)
    expect(logs[0].dedupeKey).toMatch(/^reminder:[0-9a-f-]{36}:.+:prep$/)
  })

  it('sends nothing for users who did not opt in, or whose email is not verified', async () => {
    const optedOut = await verifiedUser({ emailUpcomingReminders: false, emailPrepReminders: false, emailDepartureReminders: false })
    await dueEvent(optedOut.user.id)
    const unverified = await registerAndLogin()
    await prisma.userPreference.update({ where: { userId: unverified.user.id }, data: allOn })
    await dueEvent(unverified.user.id)
    mailbox.reset()
    expect(await sweep()).toBe(0)
    expect(mailbox.sent).toHaveLength(0)
  })

  it('does not send reminders for deleted events or events that already started', async () => {
    const { user } = await verifiedUser()
    const deleted = await dueEvent(user.id)
    await prisma.event.delete({ where: { id: deleted.id } })
    await dueEvent(user.id, { startAt: new Date(Date.now() - 10 * MIN) }) // already started
    await dueEvent(user.id, { startAt: new Date(Date.now() - 3 * 60 * MIN) }) // long over
    expect(await sweep()).toBe(0)
  })

  it('recalculates when an event time changes: the old time no longer fires, the new time does', async () => {
    const { user } = await verifiedUser({ ...allOn, emailUpcomingReminders: false, emailDepartureReminders: false })
    const ev = await dueEvent(user.id, { startAt: new Date(Date.now() + 5 * 60 * MIN) }) // reminders are hours away
    expect(await sweep()).toBe(0)
    await prisma.event.update({ where: { id: ev.id }, data: { startAt: new Date(Date.now() + (lead - 1) * MIN) } }) // moved earlier: now due
    expect(await sweep()).toBe(1)
    await prisma.event.update({ where: { id: ev.id }, data: { startAt: new Date(Date.now() + 5 * 60 * MIN) } }) // moved away again
    mailbox.reset()
    expect(await sweep()).toBe(0)
  })

  it('expands a recurring event: only today occurrence is reminded, once', async () => {
    const { user } = await verifiedUser({ ...allOn, emailUpcomingReminders: false, emailDepartureReminders: false })
    const rule = await prisma.recurrenceRule.create({ data: { userId: user.id, frequency: 'DAILY', interval: 1, daysOfWeek: [] } })
    // first occurrence 3 days ago at the same time of day as today's due occurrence
    await dueEvent(user.id, { timezone: 'UTC', startAt: new Date(Date.now() + (lead - 1) * MIN - 3 * 86_400_000), isRecurring: true, recurrenceRuleId: rule.id })
    expect(await sweep()).toBe(1)
    expect(mailbox.sent).toHaveLength(1)
    await sweep()
    expect(mailbox.sent).toHaveLength(1)
  })

  it('a provider outage during a sweep does not crash it or create duplicates on the next sweep', async () => {
    const { user } = await verifiedUser({ ...allOn, emailUpcomingReminders: false, emailDepartureReminders: false })
    await dueEvent(user.id)
    mailbox.failNext(1, { retryable: false, code: 'invalid_api_key' })
    await sweep()
    expect(mailbox.sent).toHaveLength(0)
    await sweep() // the failed one is not hammered again (dedupe key already claimed)
    expect(mailbox.sent).toHaveLength(0)
    const log = await prisma.emailLog.findFirst({ where: { userId: user.id, emailType: 'EVENT_REMINDER_PREP' } })
    expect(log.status).toBe('FAILED')
  })

  it("only ever emails the event's owner (isolation)", async () => {
    const a = await verifiedUser({ ...allOn, emailUpcomingReminders: false, emailDepartureReminders: false })
    const b = await verifiedUser({ ...allOn, emailUpcomingReminders: false, emailDepartureReminders: false })
    await dueEvent(a.user.id, { title: 'Alice only' })
    await sweep()
    expect(mailbox.to(b.body.email)).toHaveLength(0)
    expect(mailbox.to(a.body.email)).toHaveLength(1)
  })
})
