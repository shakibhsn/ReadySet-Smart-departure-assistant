import { DateTime } from 'luxon'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearWeatherCache } from '../src/services/weather/weather.service.js'
import { api, bearer, registerAndLogin } from './helpers.js'

// The real Open-Meteo is NEVER called: global fetch is replaced in every test.
const TZ = 'Asia/Dhaka'
const OFFSET = 6 * 3600
const inDays = (n) => DateTime.now().setZone(TZ).plus({ days: n }).set({ hour: 10, minute: 0, second: 0, millisecond: 0 })
const make = async (token, overrides = {}) =>
  (await api().post('/api/events').set(bearer(token)).send({ title: 'Class', category: 'university', startAt: inDays(3).toFormat("yyyy-MM-dd'T'HH:mm"), timezone: TZ, destination: 'Dhaka', travelDurationMinutes: 30, preparationMinutes: 30, arrivalBufferMinutes: 10, ...overrides })).body.data.event

const json = (body, ok = true, status = 200) => ({ ok, status, json: async () => body })
const slotFor = (event) => new Date(Date.parse(event.startAt) + OFFSET * 1000).toISOString().slice(0, 13) + ':00'
const forecastBody = (event, patch = {}) => ({
  utc_offset_seconds: OFFSET,
  hourly: { time: [slotFor(event)], temperature_2m: [29.4], precipitation_probability: [60], weather_code: [61], wind_speed_10m: [14.2], ...patch },
})
const city = { results: [{ name: 'Dhaka', admin1: 'Dhaka Division', country: 'Bangladesh', latitude: 23.7, longitude: 90.4 }] }

/** fetch mock: geocoding -> `geo`, forecast -> `forecast` (each may be a value, an Error to reject with, or a function). */
const mockFetch = ({ geo = city, forecast }) => {
  const fn = vi.fn(async (url) => {
    const pick = String(url).includes('geocoding') ? geo : forecast
    const v = typeof pick === 'function' ? pick() : pick
    if (v instanceof Error) throw v
    return v.ok === undefined ? json(v) : v
  })
  vi.stubGlobal('fetch', fn)
  return fn
}
const weather = (token, id) => api().get(`/api/events/${id}/weather`).set(bearer(token))

beforeEach(() => clearWeatherCache())
afterEach(() => vi.unstubAllGlobals())

describe('GET /api/events/:id/weather', () => {
  it('returns temperature, condition, icon, rain chance, wind, forecast time and last-updated', async () => {
    const { token } = await registerAndLogin()
    const event = await make(token)
    const fetchFn = mockFetch({ forecast: undefined })
    fetchFn.mockImplementation(async (url) => json(String(url).includes('geocoding') ? city : forecastBody(event)))
    const res = await weather(token, event.id)
    expect(res.status).toBe(200)
    const w = res.body.data.weather
    expect(w.status).toBe('ok')
    expect(w.location).toEqual({ name: 'Dhaka', region: 'Dhaka Division', country: 'Bangladesh' })
    expect(w.forecast).toMatchObject({ temperatureC: 29, condition: 'Rain', icon: 'rain', rainChancePercent: 60, windSpeedKmh: 14, forecastTime: event.startAt })
    expect(new Date(w.fetchedAt).getTime()).toBeGreaterThan(0)
    // Weather is contextual: it must not touch the departure plan.
    const plan = await api().get(`/api/events/${event.id}/departure-plan`).set(bearer(token))
    expect(plan.body.data.durations.travelDurationMinutes).toBe(30)
  })

  it('tries the city part of a long destination when the full text is not found', async () => {
    const { token } = await registerAndLogin()
    const event = await make(token, { destination: 'Room 5, Science Building, Dhaka' })
    const fetchFn = vi.fn(async (url) => {
      const u = new URL(url)
      if (u.hostname.startsWith('geocoding')) return json(u.searchParams.get('name') === 'Dhaka' ? city : {})
      return json(forecastBody(event))
    })
    vi.stubGlobal('fetch', fetchFn)
    expect((await weather(token, event.id)).body.data.weather.status).toBe('ok')
  })

  it('missing destination: no_location and no provider call', async () => {
    const { token } = await registerAndLogin()
    const event = await make(token, { destination: undefined })
    const fetchFn = mockFetch({ forecast: json({}) })
    const w = (await weather(token, event.id)).body.data.weather
    expect(w.status).toBe('no_location')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('invalid location: location_not_found', async () => {
    const { token } = await registerAndLogin()
    const event = await make(token, { destination: 'Nowhere Qzxv' })
    mockFetch({ geo: {}, forecast: json({}) })
    expect((await weather(token, event.id)).body.data.weather.status).toBe('location_not_found')
  })

  it('provider failure (rejected request, HTTP 500, bad body): provider_unavailable, still HTTP 200', async () => {
    const { token } = await registerAndLogin()
    const event = await make(token)
    for (const failure of [new Error('network down'), json({}, false, 500), json({ hourly: 'garbage' })]) {
      clearWeatherCache()
      mockFetch({ forecast: failure })
      const res = await weather(token, event.id)
      expect(res.status).toBe(200)
      expect(res.body.data.weather.status).toBe('provider_unavailable')
    }
  })

  it('timeout: status timeout', async () => {
    const { token } = await registerAndLogin()
    const event = await make(token)
    mockFetch({ forecast: new DOMException('timed out', 'TimeoutError') })
    expect((await weather(token, event.id)).body.data.weather.status).toBe('timeout')
  })

  it('empty weather response: forecast_unavailable (EMPTY)', async () => {
    const { token } = await registerAndLogin()
    const event = await make(token)
    mockFetch({ forecast: json({ utc_offset_seconds: OFFSET, hourly: { time: [] } }) })
    const w = (await weather(token, event.id)).body.data.weather
    expect(w).toMatchObject({ status: 'forecast_unavailable', reason: 'EMPTY' })
  })

  it('events too far ahead or already past: forecast_unavailable without calling the provider', async () => {
    const { token } = await registerAndLogin()
    const far = await make(token, { startAt: '2030-05-10T10:00' })
    const past = await make(token, { startAt: '2020-05-10T10:00' })
    const fetchFn = mockFetch({ forecast: json({}) })
    expect((await weather(token, far.id)).body.data.weather).toMatchObject({ status: 'forecast_unavailable', reason: 'TOO_FAR' })
    expect((await weather(token, past.id)).body.data.weather).toMatchObject({ status: 'forecast_unavailable', reason: 'PAST' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("ownership: someone else's event is 404 and the provider is not called", async () => {
    const owner = await registerAndLogin()
    const other = await registerAndLogin()
    const event = await make(owner.token)
    const fetchFn = mockFetch({ forecast: json({}) })
    expect((await weather(other.token, event.id)).status).toBe(404)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('sends only the destination text to the provider (no user data)', async () => {
    const { token, user } = await registerAndLogin()
    const event = await make(token)
    const fetchFn = mockFetch({ forecast: undefined })
    fetchFn.mockImplementation(async (url) => json(String(url).includes('geocoding') ? city : forecastBody(event)))
    await weather(token, event.id)
    for (const [url] of fetchFn.mock.calls) {
      expect(String(url)).not.toContain(user.id)
      expect(String(url)).not.toContain(user.email)
    }
  })
})
