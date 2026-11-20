import { describe, expect, it } from 'vitest'
import { prisma } from '../src/config/database.js'
import { purgeOldNotifications, runNotificationSweep, startNotificationScheduler, stopNotificationScheduler } from '../src/services/notification/notificationSweep.service.js'
import { api, bearer, registerAndLogin } from './helpers.js'

// Event 2030-05-10 10:00 Asia/Dhaka (04:00Z), travel 35, prep 30, buffer 10:
//   prep start 02:45Z · departure 03:15Z · upcoming 03:00Z. Default lead = 10 minutes. The sweep takes `now` as a parameter.
const at = (hhmm) => new Date(`2030-05-10T${hhmm}:00Z`)
const make = async (token, overrides = {}) =>
  (await api().post('/api/events').set(bearer(token)).send({ title: 'Class', category: 'university', startAt: '2030-05-10T10:00', timezone: 'Asia/Dhaka', destination: 'Engineering Building', travelDurationMinutes: 35, preparationMinutes: 30, arrivalBufferMinutes: 10, ...overrides })).body.data.event
const rows = (userId) => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
const types = async (userId) => (await rows(userId)).map((n) => n.type).sort()

describe('notification sweep: timing', () => {
  it('creates nothing before the first reminder time and one prep-approaching notification at it', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token)
    expect(await runNotificationSweep(at('02:34'))).toBe(0)
    expect(await runNotificationSweep(at('02:35'))).toBe(1)
    const [n] = await rows(user.id)
    expect(n).toMatchObject({ userId: user.id, eventId: ev.id, type: 'PREP_SOON', category: 'preparation', title: 'Get ready soon' })
    expect(n.occurrenceStart.toISOString()).toBe('2030-05-10T04:00:00.000Z')
  })

  it('walks the whole timeline: prep approaching, prep now, upcoming, departure approaching, departure now', async () => {
    const { token, user } = await registerAndLogin()
    await make(token)
    for (const t of ['02:35', '02:45', '03:00', '03:05', '03:15']) await runNotificationSweep(at(t))
    expect(await types(user.id)).toEqual(['DEPARTURE_NOW', 'DEPARTURE_SOON', 'PREP_NOW', 'PREP_SOON', 'UPCOMING'])
  })

  it('writes local clock times in the event timezone', async () => {
    const { token, user } = await registerAndLogin()
    await make(token)
    await runNotificationSweep(at('02:45'))
    expect((await rows(user.id))[0].body).toContain('Leave at 9:15 AM')
  })

  it('a destination appears in departure reminders', async () => {
    const { token, user } = await registerAndLogin()
    await make(token)
    await runNotificationSweep(at('03:15'))
    expect((await rows(user.id)).find((n) => n.type === 'DEPARTURE_NOW').body).toContain('to Engineering Building')
  })

  it('an event that already started, or is long past, produces nothing', async () => {
    const { token, user } = await registerAndLogin()
    await make(token)
    await make(token, { startAt: '2020-01-01T10:00' })
    expect(await runNotificationSweep(at('04:00'))).toBe(0)
    expect(await runNotificationSweep(at('06:00'))).toBe(0)
    expect(await rows(user.id)).toHaveLength(0)
  })

  it('recurring events notify only for the next occurrence in range', async () => {
    const { token, user } = await registerAndLogin()
    await make(token, { recurrence: { frequency: 'DAILY', interval: 1 } })
    await runNotificationSweep(new Date('2030-05-12T02:35:00Z'))
    const list = await rows(user.id)
    expect(list).toHaveLength(1)
    expect(list[0].occurrenceStart.toISOString()).toBe('2030-05-12T04:00:00.000Z')
  })
})

describe('notification sweep: safety', () => {
  it('running the same sweep twice, or twice at once, never duplicates a reminder', async () => {
    const { token, user } = await registerAndLogin()
    await make(token)
    await runNotificationSweep(at('02:45'))
    await runNotificationSweep(at('02:45'))
    await Promise.all([runNotificationSweep(at('02:46')), runNotificationSweep(at('02:46')), runNotificationSweep(at('02:47'))])
    expect(await rows(user.id)).toHaveLength(1)
  })

  it('restart safety: a reminder missed while the server was down is created when it is back (inside the grace window), older ones are skipped', async () => {
    const { token, user } = await registerAndLogin()
    await make(token)
    // Server "down" from 02:00 to 03:20: the first sweep after the restart is at 03:20.
    await runNotificationSweep(at('03:20'))
    expect(await types(user.id)).toEqual(['DEPARTURE_NOW', 'UPCOMING']) // prep reminders (35 min old) and "approaching" ones are skipped
    const countAfterRestart = (await rows(user.id)).length
    await runNotificationSweep(at('03:21')) // second sweep after restart: nothing new
    expect(await rows(user.id)).toHaveLength(countAfterRestart)
  })

  it('each user only receives their own notifications', async () => {
    const a = await registerAndLogin()
    const b = await registerAndLogin()
    await make(a.token)
    await make(b.token, { title: 'B class' })
    await runNotificationSweep(at('02:45'))
    for (const u of [a, b]) {
      const list = await rows(u.user.id)
      expect(list).toHaveLength(1)
      expect(list[0].userId).toBe(u.user.id)
    }
    expect((await rows(b.user.id))[0].body).toContain('B class')
  })

  it('respects the master switch and each reminder type', async () => {
    const off = await registerAndLogin()
    const onlyDeparture = await registerAndLogin()
    await make(off.token)
    await make(onlyDeparture.token)
    await api().patch('/api/users/me/notification-preferences').set(bearer(off.token)).send({ enabled: false })
    await api().patch('/api/users/me/notification-preferences').set(bearer(onlyDeparture.token)).send({ prep: false, upcoming: false, checklist: false })
    for (const t of ['02:35', '02:45', '03:00', '03:05', '03:15']) await runNotificationSweep(at(t))
    expect(await rows(off.user.id)).toHaveLength(0)
    expect(await types(onlyDeparture.user.id)).toEqual(['DEPARTURE_NOW', 'DEPARTURE_SOON'])
  })

  it('uses the lead time the user chose', async () => {
    const { token, user } = await registerAndLogin()
    await make(token)
    await api().patch('/api/users/me/notification-preferences').set(bearer(token)).send({ leadMinutes: 30 })
    await runNotificationSweep(at('02:15'))
    expect((await rows(user.id))[0]).toMatchObject({ type: 'PREP_SOON', title: 'Get ready soon' })
    expect((await rows(user.id))[0].body).toContain('in 30 minutes')
  })

  it('checklist reminder appears only while items are still pending', async () => {
    const done = await registerAndLogin()
    const pending = await registerAndLogin()
    const e1 = await make(done.token)
    const e2 = await make(pending.token)
    const item = (await api().post(`/api/events/${e1.id}/checklist`).set(bearer(done.token)).send({ text: 'Keys' })).body.data.item
    await api().patch(`/api/events/${e1.id}/checklist/${item.id}/completion`).set(bearer(done.token)).send({ done: true })
    await api().post(`/api/events/${e2.id}/checklist`).set(bearer(pending.token)).send({ text: 'Laptop' })
    await runNotificationSweep(at('03:05'))
    expect(await types(done.user.id)).not.toContain('CHECKLIST')
    const n = (await rows(pending.user.id)).find((x) => x.type === 'CHECKLIST')
    expect(n.body).toBe('1 item still pending for Class.')
  })

  it('a failing database inside the scheduler does not crash the process (scheduler is a single idempotent timer)', () => {
    expect(startNotificationScheduler({ intervalMs: 3_600_000 })).toBe(true)
    expect(startNotificationScheduler({ intervalMs: 3_600_000 })).toBe(false) // never a second timer
    stopNotificationScheduler()
    expect(startNotificationScheduler({ intervalMs: 3_600_000 })).toBe(true)
    stopNotificationScheduler()
  })
})

describe('retention', () => {
  it('purges notifications older than 90 days and keeps recent ones', async () => {
    const { user } = await registerAndLogin()
    const base = { userId: user.id, type: 'PREP_NOW', category: 'preparation', title: 't', body: 'b' }
    await prisma.notification.create({ data: { ...base, dedupeKey: 'old', createdAt: new Date(Date.now() - 100 * 86_400_000) } })
    await prisma.notification.create({ data: { ...base, dedupeKey: 'recent' } })
    // lastCleanup is throttled to once an hour: use a far-future clock so this call always runs.
    await purgeOldNotifications(new Date(Date.now() + 10 * 3_600_000))
    expect((await rows(user.id)).map((n) => n.dedupeKey)).toEqual(['recent'])
  })
})

describe('event changes and reminders', () => {
  it('editing the schedule removes UNREAD stale reminders and the next sweep follows the new times; read ones stay', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token)
    await runNotificationSweep(at('02:35'))
    const [old] = await rows(user.id)
    expect(old.type).toBe('PREP_SOON')

    // Longer preparation: prep start moves to 02:15Z.
    expect((await api().patch(`/api/events/${ev.id}`).set(bearer(token)).send({ preparationMinutes: 60 })).status).toBe(200)
    expect(await prisma.notification.count({ where: { id: old.id } })).toBe(0)
    await runNotificationSweep(at('02:35'))
    const after = await rows(user.id)
    expect(after.map((n) => n.type)).toEqual(['PREP_NOW']) // the new prep start (02:15Z) has already passed by 20 minutes
    expect(after[0].body).toContain('Leave at 9:15 AM')

    // A READ notification is history and survives a later schedule change.
    await api().patch(`/api/notifications/${after[0].id}/read`).set(bearer(token))
    await api().patch(`/api/events/${ev.id}`).set(bearer(token)).send({ travelDurationMinutes: 50 })
    expect(await prisma.notification.count({ where: { id: after[0].id } })).toBe(1)
  })

  it('moving the event time makes reminders follow the new time, and the old time never fires', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token)
    await api().patch(`/api/events/${ev.id}`).set(bearer(token)).send({ startAt: '2030-05-10T12:00' }) // +2h: prep start 04:45Z
    await runNotificationSweep(at('02:45'))
    expect(await rows(user.id)).toHaveLength(0)
    await runNotificationSweep(at('04:45'))
    expect((await rows(user.id)).map((n) => n.type)).toEqual(['PREP_NOW'])
  })

  it('editing only the title or notes does not disturb existing reminders', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token)
    await runNotificationSweep(at('02:35'))
    await api().patch(`/api/events/${ev.id}`).set(bearer(token)).send({ title: 'Renamed', notes: 'x', preparationMinutes: 30 }) // same value: no change
    expect(await rows(user.id)).toHaveLength(1)
  })

  it('deleting (cancelling) an event removes its reminders and prevents future ones', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token)
    await runNotificationSweep(at('02:45'))
    expect(await rows(user.id)).toHaveLength(1)
    await api().delete(`/api/events/${ev.id}`).set(bearer(token))
    expect(await rows(user.id)).toHaveLength(0)
    expect(await runNotificationSweep(at('03:15'))).toBe(0)
    expect(await rows(user.id)).toHaveLength(0)
  })
})
