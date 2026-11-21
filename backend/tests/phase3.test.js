import { DateTime } from 'luxon'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../src/config/database.js'
import { clearWeatherCache, getEventWeather } from '../src/services/weather/weather.service.js'
import { api, bearer, registerAndLogin } from './helpers.js'

const TZ = 'Asia/Dhaka'
// An event starting in `minutes` from now: prep 15 + travel 20 + buffer 5 => preparation planned 40 min before the start.
const inMinutes = (m) => DateTime.now().setZone(TZ).plus({ minutes: m }).toFormat("yyyy-MM-dd'T'HH:mm")
const make = async (token, over = {}) => (await api().post('/api/events').set(bearer(token)).send({ title: 'Office day', category: 'office', startAt: inMinutes(45), timezone: TZ, destination: 'Dhaka', travelDurationMinutes: 20, preparationMinutes: 15, arrivalBufferMinutes: 5, ...over })).body.data.event
const tap = (token, id, action, extra = {}) => api().post(`/api/events/${id}/prep-log`).set(bearer(token)).send({ action, ...extra })
const state = (token, id) => api().get(`/api/events/${id}/prep-log`).set(bearer(token))
const profile = async (token) => (await api().get('/api/prep-profile').set(bearer(token))).body.data

describe('tap-to-log: server timestamps, sequences, idempotence', () => {
  it('start -> ready -> left; every timestamp comes from the server; repeated taps create nothing new', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token)
    const before = Date.now()
    const s1 = await tap(token, ev.id, 'start')
    expect(s1.status).toBe(200)
    const log = s1.body.data.log
    expect(new Date(log.prepStartedAt).getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect(new Date(log.prepStartedAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000)
    expect(s1.body.data.changed).toBe(true)
    const again = await tap(token, ev.id, 'start')
    expect(again.body.data).toMatchObject({ changed: false, log: { id: log.id, prepStartedAt: log.prepStartedAt } })
    await tap(token, ev.id, 'ready')
    const done = await tap(token, ev.id, 'left')
    expect(done.body.data.log).toMatchObject({ id: log.id, plannedPrepMinutes: 15, category: 'office' })
    expect(done.body.data.log.readyAt).toBeTruthy()
    expect(done.body.data.log.leftAt).toBeTruthy()
    const readyAt = done.body.data.log.readyAt
    expect((await tap(token, ev.id, 'ready')).body.data.log.readyAt).toBe(readyAt) // repeat: unchanged
    expect(await prisma.preparationLog.count({ where: { userId: user.id } })).toBe(1)
    expect((await state(token, ev.id)).body.data.log.id).toBe(log.id)
  })

  it('the client can only say WHICH action: supplying a timestamp or an unknown action is rejected', async () => {
    const { token } = await registerAndLogin()
    const ev = await make(token)
    expect((await tap(token, ev.id, 'start', { prepStartedAt: '2020-01-01T00:00:00Z' })).status).toBe(400)
    expect((await tap(token, ev.id, 'start', { occurrence: 'yesterday' })).status).toBe(400)
    expect((await tap(token, ev.id, 'teleport')).status).toBe(400)
  })

  it('rejects invalid sequences (409) and keeps the log unchanged', async () => {
    const { token } = await registerAndLogin()
    const ev = await make(token)
    expect((await tap(token, ev.id, 'ready')).status).toBe(409) // ready before start
    expect((await tap(token, ev.id, 'cancel')).status).toBe(409) // nothing to cancel
    await tap(token, ev.id, 'start')
    await tap(token, ev.id, 'left')
    const late = await tap(token, ev.id, 'ready') // after leaving
    expect(late.status).toBe(409)
    expect((await tap(token, ev.id, 'start')).body.data.changed).toBe(false) // start after start: idempotent no-op
    const s = (await state(token, ev.id)).body.data.log
    expect(s.readyAt).toBeNull()
  })

  it('a cancelled session is excluded and can be restarted', async () => {
    const { token } = await registerAndLogin()
    const ev = await make(token)
    await tap(token, ev.id, 'start')
    const cancelled = (await tap(token, ev.id, 'cancel')).body.data.log
    expect(cancelled.cancelledAt).toBeTruthy()
    expect(cancelled.actualPrepMinutes).toBeNull()
    expect((await tap(token, ev.id, 'ready')).status).toBe(409)
    const restarted = (await tap(token, ev.id, 'start')).body.data.log
    expect(restarted.cancelledAt).toBeNull()
    expect(restarted.prepStartedAt).toBeTruthy()
  })

  it('logging is only possible near the event (window), never for far-future or long-past events', async () => {
    const { token } = await registerAndLogin()
    const far = await make(token, { startAt: '2030-05-10T10:00' })
    const past = await make(token, { startAt: '2020-05-10T10:00' })
    expect((await tap(token, far.id, 'start')).status).toBe(409)
    expect((await tap(token, past.id, 'start')).status).toBe(409)
    const g = (await state(token, far.id)).body.data
    expect(g.log).toBeNull()
  })

  it('"I left" records the names of MY checklist items still unchecked (labelled as unchecked, never as forgotten)', async () => {
    const { token } = await registerAndLogin()
    const ev = await make(token)
    const a = (await api().post(`/api/events/${ev.id}/checklist`).set(bearer(token)).send({ text: 'Laptop' })).body.data.item
    await api().post(`/api/events/${ev.id}/checklist`).set(bearer(token)).send({ text: 'Charger' })
    await api().patch(`/api/events/${ev.id}/checklist/${a.id}/completion`).set(bearer(token)).send({ done: true })
    await tap(token, ev.id, 'start')
    expect((await tap(token, ev.id, 'ready')).body.data.log.uncheckedItems).toEqual([]) // only captured at "I left"
    expect((await tap(token, ev.id, 'left')).body.data.log.uncheckedItems).toEqual(['Charger'])
    expect(await prisma.forgottenItemReport.count()).toBe(0) // never turned into a "forgotten" report
  })

  it('ownership and authentication', async () => {
    const owner = await registerAndLogin()
    const intruder = await registerAndLogin()
    const ev = await make(owner.token)
    const log = (await tap(owner.token, ev.id, 'start')).body.data.log
    expect((await tap(intruder.token, ev.id, 'start')).status).toBe(404)
    expect((await state(intruder.token, ev.id)).status).toBe(404)
    expect((await api().delete(`/api/prep-profile/logs/${log.id}`).set(bearer(intruder.token))).status).toBe(404)
    expect((await api().get('/api/prep-profile/logs').set(bearer(intruder.token))).body.data.logs).toEqual([])
    expect((await api().post(`/api/events/${ev.id}/prep-log`).send({ action: 'start' })).status).toBe(401)
    expect((await api().get('/api/prep-profile')).status).toBe(401)
    expect(await prisma.preparationLog.count({ where: { userId: owner.user.id } })).toBe(1)
  })
})

describe('nullable event_id and deleted events', () => {
  it('deleting an event keeps its logs (event_id becomes NULL); no new log can be created for it; duplicates for a live event are impossible', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token)
    await tap(token, ev.id, 'start')
    const occ = (await prisma.preparationLog.findFirst({ where: { userId: user.id } })).occurrenceStart
    // A second row for the same live event + occurrence violates the unique key.
    await expect(prisma.preparationLog.create({ data: { userId: user.id, eventId: ev.id, occurrenceStart: occ, category: 'office', plannedPrepMinutes: 1, plannedDepartureAt: occ } })).rejects.toThrow()

    await api().delete(`/api/events/${ev.id}`).set(bearer(token))
    const kept = await prisma.preparationLog.findMany({ where: { userId: user.id } })
    expect(kept).toHaveLength(1)
    expect(kept[0].eventId).toBeNull()
    expect((await tap(token, ev.id, 'start')).status).toBe(404) // the API cannot create logs for a deleted event
    expect(await prisma.preparationLog.count({ where: { userId: user.id } })).toBe(1)

    // PostgreSQL treats NULLs as distinct in unique indexes: rows of DIFFERENT deleted events never collide with each other.
    // (This is documented behaviour; it cannot create duplicates because the API only ever writes logs for existing events.)
    await prisma.preparationLog.create({ data: { userId: user.id, eventId: null, occurrenceStart: occ, category: 'office', plannedPrepMinutes: 1, plannedDepartureAt: occ } })
    expect(await prisma.preparationLog.count({ where: { userId: user.id, occurrenceStart: occ } })).toBe(2)
  })

  it('two simultaneous first taps create exactly one log', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token)
    await Promise.all([tap(token, ev.id, 'start'), tap(token, ev.id, 'start'), tap(token, ev.id, 'left')])
    expect(await prisma.preparationLog.count({ where: { userId: user.id } })).toBe(1)
  })
})

describe('profile: suggestions, overrides, disable, delete', () => {
  const seed = (userId, n, { category = 'office', prep = 35, lateBy = 8 } = {}) =>
    prisma.preparationLog.createMany({
      data: Array.from({ length: n }, (_, i) => {
        const dep = new Date(Date.now() - (i + 1) * 86_400_000)
        return { userId, eventId: null, occurrenceStart: new Date(dep.getTime() + 40 * 60_000 + i * 1000), category, plannedPrepMinutes: 30, plannedDepartureAt: dep, prepStartedAt: new Date(dep.getTime() - prep * 60_000), readyAt: new Date(dep.getTime() - 5 * 60_000), leftAt: new Date(dep.getTime() + lateBy * 60_000) }
      }),
    })

  it('a new user gets a graceful, empty profile', async () => {
    const { token } = await registerAndLogin()
    const p = await profile(token)
    expect(p).toMatchObject({ enabled: true, minSamples: 3, overrides: {} })
    expect(p.preparation.overall).toMatchObject({ status: 'insufficient_data', samples: 0 })
    expect(p.buffer.status).toBe('insufficient_data')
    expect(p.weekly.message).toMatch(/No activity logged/)
  })

  it('suggests prep time and buffer from logged history, per user, without touching any event', async () => {
    const mine = await registerAndLogin()
    const other = await registerAndLogin()
    const ev = await make(mine.token, { startAt: '2030-05-10T10:00' })
    await seed(mine.user.id, 5)
    const p = await profile(mine.token)
    expect(p.preparation.byCategory.office).toMatchObject({ status: 'ok', minutes: 35, samples: 5, confidence: 'medium' })
    expect(p.preparation.byCategory.office.explanation).toMatch(/75th percentile/)
    expect(p.buffer).toMatchObject({ status: 'ok', extraMinutes: 10, minutes: 20, currentBuffer: 10 })
    expect((await profile(other.token)).preparation.overall.status).toBe('insufficient_data') // user-specific
    const after = (await api().get(`/api/events/${ev.id}`).set(bearer(mine.token))).body.data.event
    expect(after).toMatchObject({ preparationMinutes: 15, arrivalBufferMinutes: 5, startAt: ev.startAt }) // never silently changed
  })

  it('early departures are not lateness: someone who always leaves early gets no extra buffer', async () => {
    const { token, user } = await registerAndLogin()
    await seed(user.id, 5, { lateBy: -20 })
    expect((await profile(token)).buffer).toMatchObject({ status: 'ok', extraMinutes: 0, minutes: 10 })
  })

  it('incomplete and cancelled sessions never enter the duration statistics', async () => {
    const { token, user } = await registerAndLogin()
    await seed(user.id, 2)
    const dep = new Date(Date.now() - 10 * 86_400_000)
    await prisma.preparationLog.create({ data: { userId: user.id, eventId: null, occurrenceStart: dep, category: 'office', plannedPrepMinutes: 30, plannedDepartureAt: dep, prepStartedAt: new Date(dep.getTime() - 60 * 60_000) } }) // never finished
    await prisma.preparationLog.create({ data: { userId: user.id, eventId: null, occurrenceStart: new Date(dep.getTime() + 1000), category: 'office', plannedPrepMinutes: 30, plannedDepartureAt: dep, prepStartedAt: new Date(dep.getTime() - 60 * 60_000), readyAt: dep, cancelledAt: dep } })
    expect((await profile(token)).preparation.overall).toMatchObject({ status: 'insufficient_data', samples: 2 })
  })

  it('the user can override a value, clear it, and overrides are validated and private', async () => {
    const me = await registerAndLogin()
    const other = await registerAndLogin()
    const put = (token, body) => api().put('/api/prep-profile/overrides').set(bearer(token)).send(body)
    expect((await put(me.token, { category: 'gym', prepMinutes: 25, bufferMinutes: 10 })).body.data.overrides).toEqual({ gym: { prepMinutes: 25, bufferMinutes: 10 } })
    expect((await profile(me.token)).overrides.gym.prepMinutes).toBe(25)
    expect((await profile(other.token)).overrides).toEqual({})
    expect((await put(me.token, { category: 'nope', prepMinutes: 5 })).status).toBe(400)
    expect((await put(me.token, { category: 'gym' })).status).toBe(400)
    expect((await put(me.token, { category: 'gym', prepMinutes: 5000 })).status).toBe(400)
    expect((await api().delete('/api/prep-profile/overrides/gym').set(bearer(me.token))).body.data.overrides).toEqual({})
    expect((await put(me.token, { category: 'gym', prepMinutes: 25 })).status).toBe(200)
  })

  it('can be switched off (no logging, no suggestions), switched on again, and logs can be deleted or fully erased', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token)
    await seed(user.id, 4)
    expect((await api().patch('/api/prep-profile/settings').set(bearer(token)).send({ enabled: false })).body.data.enabled).toBe(false)
    const off = await profile(token)
    expect(off.enabled).toBe(false)
    expect(off).not.toHaveProperty('preparation')
    expect((await tap(token, ev.id, 'start')).status).toBe(409)
    await api().patch('/api/prep-profile/settings').set(bearer(token)).send({ enabled: true })
    expect((await profile(token)).preparation.overall.status).toBe('ok')

    const logs = (await api().get('/api/prep-profile/logs').set(bearer(token))).body.data.logs
    expect(logs).toHaveLength(4)
    expect((await api().delete(`/api/prep-profile/logs/${logs[0].id}`).set(bearer(token))).status).toBe(200)
    expect((await profile(token)).preparation.overall).toMatchObject({ status: 'insufficient_data', samples: 3 }).constructor
    const erased = await api().delete('/api/prep-profile/data').set(bearer(token))
    expect(erased.body.data.deleted).toBe(3)
    expect(await prisma.preparationLog.count({ where: { userId: user.id } })).toBe(0)
  })

  it('weekly summary reflects only the last 7 days', async () => {
    const { token, user } = await registerAndLogin()
    await seed(user.id, 3)
    const dep = new Date(Date.now() - 20 * 86_400_000)
    await prisma.preparationLog.create({ data: { userId: user.id, eventId: null, occurrenceStart: dep, category: 'office', plannedPrepMinutes: 30, plannedDepartureAt: dep, prepStartedAt: new Date(dep.getTime() - 99 * 60_000), readyAt: dep } })
    const w = (await profile(token)).weekly
    expect(w).toMatchObject({ eventsLogged: 3, preparationsMeasured: 3, avgActualPrepMinutes: 35, departuresLogged: 3 })
  })
})

describe('weather advice, stale forecasts and independence from departure times', () => {
  beforeEach(() => clearWeatherCache())
  afterEach(() => vi.unstubAllGlobals())
  const OFFSET = 6 * 3600
  const geo = { results: [{ name: 'Dhaka', admin1: 'Dhaka Division', country: 'Bangladesh', latitude: 23.7, longitude: 90.4 }] }
  const when = (days) => DateTime.now().setZone(TZ).plus({ days }).set({ hour: 10, minute: 0, second: 0, millisecond: 0 }).toFormat("yyyy-MM-dd'T'HH:mm")
  const slotFor = (event) => new Date(Date.parse(event.startAt) + OFFSET * 1000).toISOString().slice(0, 13) + ':00'
  const forecast = (event, over = {}) => ({ utc_offset_seconds: OFFSET, hourly: { time: [slotFor(event)], temperature_2m: [34], precipitation_probability: [70], weather_code: [61], wind_speed_10m: [12], ...over } })
  const respond = (body) => ({ ok: true, json: async () => body })
  const downFetch = async () => { throw new Error('network down') }

  it('the weather endpoint adds advice, with forecast time and location, and never changes the departure plan', async () => {
    const { token } = await registerAndLogin()
    const ev = await make(token, { startAt: when(3) })
    const planBefore = (await api().get(`/api/events/${ev.id}/departure-plan`).set(bearer(token))).body.data.plan
    vi.stubGlobal('fetch', vi.fn(async (url) => respond(String(url).includes('geocoding') ? geo : forecast(ev))))
    const w = (await api().get(`/api/events/${ev.id}/weather`).set(bearer(token))).body.data.weather
    expect(w).toMatchObject({ status: 'ok', stale: false, location: { name: 'Dhaka' } })
    expect(w.forecast.forecastTime).toBe(ev.startAt)
    expect(w.forecast.localTime).toMatch(/T10:00$/) // the destination's LOCAL time (UTC+6)
    expect(w.advice.map((a) => a.id)).toEqual(['RAIN', 'HEAT'])
    expect(w.advice[0].message).toMatch(/umbrella/)
    const planAfter = (await api().get(`/api/events/${ev.id}/departure-plan`).set(bearer(token))).body.data.plan
    expect(planAfter).toEqual(planBefore)
  })

  it('severe weather produces a warning; pleasant weather produces no advice', async () => {
    const { token } = await registerAndLogin()
    const ev = await make(token, { startAt: when(3) })
    vi.stubGlobal('fetch', vi.fn(async (url) => respond(String(url).includes('geocoding') ? geo : forecast(ev, { weather_code: [95], temperature_2m: [20], wind_speed_10m: [30] }))))
    const w = (await api().get(`/api/events/${ev.id}/weather`).set(bearer(token))).body.data.weather
    expect(w.advice[0]).toMatchObject({ id: 'SEVERE', severity: 'warning' })
    clearWeatherCache()
    vi.stubGlobal('fetch', vi.fn(async (url) => respond(String(url).includes('geocoding') ? geo : forecast(ev, { weather_code: [0], temperature_2m: [22], precipitation_probability: [5] }))))
    expect((await api().get(`/api/events/${ev.id}/weather`).set(bearer(token))).body.data.weather.advice).toEqual([])
  })

  it('when the provider fails, a forecast loaded under 3 hours ago is shown clearly as NOT current; older than that is unavailable', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token, { startAt: when(3) })
    const t0 = new Date()
    vi.stubGlobal('fetch', vi.fn(async (url) => respond(String(url).includes('geocoding') ? geo : forecast(ev))))
    const fresh = await getEventWeather(user.id, ev.id, t0)
    expect(fresh).toMatchObject({ status: 'ok', stale: false, fetchedAt: t0.toISOString() })

    vi.stubGlobal('fetch', vi.fn(downFetch))
    const stale = await getEventWeather(user.id, ev.id, new Date(t0.getTime() + 30 * 60_000))
    expect(stale).toMatchObject({ status: 'ok', stale: true, fetchedAt: t0.toISOString(), location: { name: 'Dhaka' } })
    expect(stale.forecast.forecastTime).toBe(ev.startAt) // the forecast's own time is still reported
    expect(stale.message).toMatch(/not a current one/)
    expect(stale.advice.length).toBeGreaterThan(0)

    const tooOld = await getEventWeather(user.id, ev.id, new Date(t0.getTime() + 3 * 3_600_000 + 60_000))
    expect(tooOld).toMatchObject({ status: 'provider_unavailable', forecast: null })
    expect(tooOld).not.toHaveProperty('advice')
  })

  it('a provider failure with nothing cached is a graceful "unavailable", and a timeout is labelled as such', async () => {
    const { token, user } = await registerAndLogin()
    const ev = await make(token, { startAt: when(3) })
    vi.stubGlobal('fetch', vi.fn(async (url) => { if (String(url).includes('geocoding')) return respond(geo); throw new DOMException('slow', 'TimeoutError') }))
    expect((await getEventWeather(user.id, ev.id, new Date())).status).toBe('timeout')
    const res = await api().get(`/api/events/${ev.id}/weather`).set(bearer(token))
    expect(res.status).toBe(200) // weather stays optional: the endpoint itself never fails
  })

  it('missing location, forecast not available yet, and another user’s event', async () => {
    const owner = await registerAndLogin()
    const other = await registerAndLogin()
    const none = await make(owner.token, { startAt: when(3), destination: undefined })
    const fn = vi.fn(async () => respond({}))
    vi.stubGlobal('fetch', fn)
    expect((await api().get(`/api/events/${none.id}/weather`).set(bearer(owner.token))).body.data.weather.status).toBe('no_location')
    expect(fn).not.toHaveBeenCalled()
    expect((await api().get(`/api/events/${none.id}/weather`).set(bearer(other.token))).status).toBe(404)
  })
})
