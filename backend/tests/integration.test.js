import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../src/config/database.js'
import { runNotificationSweep } from '../src/services/notification/notificationSweep.service.js'
import { clearWeatherCache } from '../src/services/weather/weather.service.js'
import { api, bearer, registerAndLogin, uniqueEmail } from './helpers.js'

// One journey through every module, on the real database and the real HTTP stack (weather provider mocked).
beforeEach(() => clearWeatherCache())
afterEach(() => vi.unstubAllGlobals())

describe('end to end: login -> event -> departure plan -> checklist -> weather -> notifications -> edit -> delete', () => {
  it('connects every module with consistent backend data', async () => {
    // 1. Register, then log in again with the same credentials.
    const email = uniqueEmail('e2e')
    const reg = await api().post('/api/auth/register').send({ name: 'E2E User', email, password: 'Sup3rSecret!', confirmPassword: 'Sup3rSecret!' })
    expect(reg.status).toBe(201)
    const login = await api().post('/api/auth/login').send({ email, password: 'Sup3rSecret!' })
    expect(login.status).toBe(200)
    const token = login.body.data.token
    const userId = login.body.data.user.id

    // 2-3. Create an event: 10:00 Dhaka, 35 min travel, 30 min prep, 10 min buffer.
    const created = await api().post('/api/events').set(bearer(token)).send({ title: 'Algorithms Class', category: 'university', startAt: '2030-05-10T10:00', timezone: 'Asia/Dhaka', destination: 'Dhaka', travelDurationMinutes: 35, preparationMinutes: 30, arrivalBufferMinutes: 10 })
    expect(created.status).toBe(201)
    const event = created.body.data.event

    // 4-5. The backend engine calculates: arrival 09:50, departure 09:15, prep start 08:45 (local).
    const plan = (await api().get(`/api/events/${event.id}/departure-plan`).set(bearer(token))).body.data
    expect(plan.plan).toMatchObject({ targetArrival: '2030-05-10T03:50:00.000Z', departureTime: '2030-05-10T03:15:00.000Z', preparationStart: '2030-05-10T02:45:00.000Z' })
    expect(plan.local.departureTime.time12).toBe('9:15 AM')

    // 6-8. Dashboard / planner / details all read the SAME backend plan.
    // (The dashboard list only looks a few weeks ahead, so a second event two days out stands in for it.)
    const soonStart = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 16)
    const soon = (await api().post('/api/events').set(bearer(token)).send({ title: 'Soon', category: 'other', startAt: soonStart, timezone: 'UTC', travelDurationMinutes: 35, preparationMinutes: 30, arrivalBufferMinutes: 10 })).body.data.event
    const soonPlan = (await api().get(`/api/events/${soon.id}/departure-plan`).set(bearer(token))).body.data
    const upcoming = (await api().get('/api/departure/upcoming?days=7&limit=5').set(bearer(token))).body.data.plans
    expect(upcoming.find((p) => p.event.id === soon.id).plan.departureTime).toBe(soonPlan.plan.departureTime)
    const preview = (await api().post('/api/departure/preview').set(bearer(token)).send({ startAt: '2030-05-10T10:00', timezone: 'Asia/Dhaka', travelDurationMinutes: 35, preparationMinutes: 30, arrivalBufferMinutes: 10 })).body.data
    expect(preview.plan.departureTime).toBe(plan.plan.departureTime) // the create-event preview uses the same engine

    // 9. Checklist: template + custom item + completion.
    const tpl = await api().post(`/api/events/${event.id}/checklist/apply-template`).set(bearer(token)).send({})
    expect(tpl.body.data.added).toBeGreaterThan(0)
    const first = tpl.body.data.items[0]
    await api().patch(`/api/events/${event.id}/checklist/${first.id}/completion`).set(bearer(token)).send({ done: true })
    const list = (await api().get(`/api/events/${event.id}/checklist`).set(bearer(token))).body.data
    expect(list.progress.done).toBe(1)

    // 10. Weather is optional context and never changes the plan.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) }))) // geocoding finds nothing -> graceful
    const weather = (await api().get(`/api/events/${event.id}/weather`).set(bearer(token))).body.data.weather
    expect(['forecast_unavailable', 'location_not_found']).toContain(weather.status)
    const planAfter = (await api().get(`/api/events/${event.id}/departure-plan`).set(bearer(token))).body.data
    expect(planAfter.plan).toEqual(plan.plan)

    // 12-13. At prep start the scheduler creates the notification; the user reads and manages it.
    expect(await runNotificationSweep(new Date('2030-05-10T02:45:00Z'))).toBe(1)
    const notes = (await api().get('/api/notifications').set(bearer(token))).body.data
    expect(notes.unreadCount).toBe(1)
    expect(notes.notifications[0]).toMatchObject({ eventId: event.id, type: 'PREP_NOW', read: false })
    await api().patch(`/api/notifications/${notes.notifications[0].id}/read`).set(bearer(token))
    expect((await api().get('/api/notifications/unread-count').set(bearer(token))).body.data.unreadCount).toBe(0)

    // 14. Editing the event updates the calculation, and later reminders follow the new schedule.
    await api().patch(`/api/events/${event.id}`).set(bearer(token)).send({ travelDurationMinutes: 65 })
    const edited = (await api().get(`/api/events/${event.id}/departure-plan`).set(bearer(token))).body.data
    expect(edited.plan.departureTime).toBe('2030-05-10T02:45:00.000Z') // 30 minutes earlier
    expect(edited.plan.preparationStart).toBe('2030-05-10T02:15:00.000Z')
    expect(await runNotificationSweep(new Date('2030-05-10T02:35:00Z'))).toBeGreaterThan(0) // new schedule: departure approaching / prep now

    // 15. Deleting the event removes its checklist and reminders; nothing fires afterwards.
    expect((await api().delete(`/api/events/${event.id}`).set(bearer(token))).status).toBe(200)
    expect(await prisma.notification.count({ where: { userId } })).toBe(0)
    expect(await prisma.checklistItem.count({ where: { userId } })).toBe(0)
    expect(await runNotificationSweep(new Date('2030-05-10T03:00:00Z'))).toBe(0)
  })

  it('a second user sees none of it', async () => {
    const a = await registerAndLogin()
    const b = await registerAndLogin()
    const ev = (await api().post('/api/events').set(bearer(a.token)).send({ title: 'Private', category: 'other', startAt: '2030-05-10T10:00', timezone: 'Asia/Dhaka', travelDurationMinutes: 35, preparationMinutes: 30, arrivalBufferMinutes: 10 })).body.data.event
    await runNotificationSweep(new Date('2030-05-10T02:45:00Z'))
    expect((await api().get('/api/notifications').set(bearer(b.token))).body.data.notifications).toEqual([])
    expect((await api().get(`/api/events/${ev.id}/departure-plan`).set(bearer(b.token))).status).toBe(404)
    expect((await api().get(`/api/events/${ev.id}/checklist`).set(bearer(b.token))).status).toBe(404)
    expect((await api().get(`/api/events/${ev.id}/weather`).set(bearer(b.token))).status).toBe(404)
  })
})
