import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { clearForecastCache } from '../src/services/explore/forecast.service.js'
import { clearLocationCache } from '../src/services/explore/locationSearch.service.js'
import { clearNearbyCache } from '../src/services/explore/nearby.service.js'
import { bearer, registerAndLogin } from './helpers.js'

const json = (body, ok = true, status = 200) => ({ ok, status, json: async () => body })
const forecastBody = {
  timezone: 'Asia/Dhaka', utc_offset_seconds: 21600,
  current: { time: '2030-05-10T12:15', temperature_2m: 30, apparent_temperature: 34, relative_humidity_2m: 70, is_day: 1, precipitation: 0, weather_code: 2, wind_speed_10m: 12 },
  hourly: { time: ['2030-05-10T12:00', '2030-05-10T13:00'], temperature_2m: [30, 31], apparent_temperature: [34, 35], precipitation_probability: [20, 30], weather_code: [2, 3], wind_speed_10m: [12, 13] },
  daily: { time: ['2030-05-10'], weather_code: [2], temperature_2m_max: [33], temperature_2m_min: [26], precipitation_probability_max: [40], wind_speed_10m_max: [20], sunrise: ['2030-05-10T05:22'], sunset: ['2030-05-10T18:21'] },
}
const geo = { results: [{ id: 7, name: 'Cox\'s Bazar', latitude: 21.43, longitude: 91.98, country: 'Bangladesh', country_code: 'BD', admin1: 'Chittagong Division', admin2: "Cox's Bazar", feature_code: 'PPLA2' }] }
const overpass = { elements: [{ type: 'node', id: 5, lat: 21.431, lon: 91.981, tags: { name: 'Sea View Cafe', amenity: 'cafe' } }] }

// A fake of all three providers; every URL it receives is recorded so we can check what leaves the server.
function makeApp({ fail = false } = {}) {
  const seen = []
  const fetchFn = vi.fn(async (url, init) => {
    seen.push({ url: String(url), init })
    if (fail) throw Object.assign(new Error('down'), { name: 'TypeError' })
    const u = String(url)
    if (u.includes('geocoding-api')) return json(geo)
    if (u.includes('api.open-meteo.com')) return json(forecastBody)
    return json(overpass)
  })
  const app = createApp({ authRateLimit: { limit: 1000 }, exploreRateLimit: { limit: 1000 }, exploreOptions: { fetchFn, overpassUrl: 'https://overpass.example/api/interpreter' } })
  return { api: () => request(app), seen, fetchFn }
}

beforeEach(() => {
  clearLocationCache()
  clearForecastCache()
  clearNearbyCache()
})

describe('Weather & Explore API: authentication', () => {
  it('every route needs a login', async () => {
    const { api } = makeApp()
    for (const path of ['/api/weather/forecast?latitude=23.8&longitude=90.4', '/api/locations/search?q=Dhaka', '/api/places/nearby?latitude=23.8&longitude=90.4']) {
      expect((await api().get(path)).status).toBe(401)
    }
  })
})

describe('Weather & Explore API: validation', () => {
  it.each([
    'latitude=91&longitude=90', 'latitude=-91&longitude=90', 'latitude=23&longitude=181', 'latitude=23&longitude=-181',
    'latitude=abc&longitude=90', 'latitude=&longitude=90', 'latitude=23', 'longitude=90', 'latitude=23.5.5&longitude=90', 'latitude=NaN&longitude=90', 'latitude=1e3&longitude=90',
  ])('forecast rejects invalid coordinates (%s)', async (qs) => {
    const { token } = await registerAndLogin()
    const { api, fetchFn } = makeApp()
    const res = await api().get(`/api/weather/forecast?${qs}`).set(bearer(token))
    expect(res.status).toBe(400)
    expect(fetchFn).not.toHaveBeenCalled() // bad input never reaches the provider
  })
  it('search validates the query length, characters, country and count', async () => {
    const { token } = await registerAndLogin()
    const { api, fetchFn } = makeApp()
    for (const qs of ['q=', 'q=a', 'q=%20%20', `q=${'x'.repeat(81)}`, 'q=Dh%00aka', 'q=Dhaka&country=XX', 'q=Dhaka&count=0', 'q=Dhaka&count=21', 'q=Dhaka&count=x', '']) {
      expect((await api().get(`/api/locations/search?${qs}`).set(bearer(token))).status, qs).toBe(400)
    }
    expect(fetchFn).not.toHaveBeenCalled()
  })
  it('nearby validates radius and category', async () => {
    const { token } = await registerAndLogin()
    const { api, fetchFn } = makeApp()
    for (const qs of ['radius=100', 'radius=99999', 'radius=abc', 'category=casino', 'category=cafe;drop', 'latitude=95']) {
      expect((await api().get(`/api/places/nearby?latitude=23.8&longitude=90.4&${qs}`).set(bearer(token))).status, qs).toBe(400)
    }
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('Weather & Explore API: working', () => {
  it('forecast returns current, hourly and daily data with the load time', async () => {
    const { token } = await registerAndLogin()
    const { api } = makeApp()
    const res = await api().get('/api/weather/forecast?latitude=23.8103&longitude=90.4125').set(bearer(token))
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ status: 'ok', stale: false, current: { temperatureC: 30, humidityPercent: 70 }, today: { minC: 26, maxC: 33 } })
    expect(res.body.data.hourly.length).toBeGreaterThan(0)
    expect(res.body.data.fetchedAt).toBeTruthy()
  })
  it('search returns Bangladesh places with their administrative area', async () => {
    const { token } = await registerAndLogin()
    const { api, seen } = makeApp()
    const res = await api().get('/api/locations/search?q=Cox').set(bearer(token))
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ status: 'ok', country: 'BD', results: [{ name: "Cox's Bazar", admin1: 'Chittagong Division', type: 'District seat', area: 'Chittagong Division, Bangladesh' }] })
    expect(new URL(seen[0].url).searchParams.get('countryCode')).toBe('BD')
  })
  it('nearby returns OpenStreetMap places with distances and attribution', async () => {
    const { token } = await registerAndLogin()
    const { api } = makeApp()
    const res = await api().get('/api/places/nearby?latitude=21.43&longitude=91.98&category=cafe').set(bearer(token))
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ status: 'ok', category: 'cafe', radiusMeters: 2500, attribution: expect.stringContaining('OpenStreetMap') })
    expect(res.body.data.places[0]).toMatchObject({ name: 'Sea View Cafe', category: 'cafe' })
    expect(res.body.data.places[0].distanceMeters).toBeGreaterThanOrEqual(0)
  })
  it('does not break saved places: /api/places still lists mine and /api/places/:id is unchanged', async () => {
    const { token } = await registerAndLogin()
    const { api } = makeApp()
    expect((await api().get('/api/places').set(bearer(token))).body.data.places).toEqual([])
    expect((await api().get('/api/places/not-a-uuid').set(bearer(token))).status).not.toBe(200)
  })
})

describe('Weather & Explore API: privacy and provider failures', () => {
  it('only coordinates and search text are sent to providers: never the token, email or user id', async () => {
    const { token, user, body } = await registerAndLogin()
    const { api, seen } = makeApp()
    await api().get('/api/weather/forecast?latitude=23.8&longitude=90.4').set(bearer(token))
    await api().get('/api/locations/search?q=Dhaka').set(bearer(token))
    await api().get('/api/places/nearby?latitude=23.8&longitude=90.4&category=park').set(bearer(token))
    expect(seen).toHaveLength(3)
    const everything = JSON.stringify(seen)
    for (const secret of [token, body.email, user.id, body.password]) expect(everything).not.toContain(secret)
  })
  it('a provider outage is a normal 200 reply with a status and no invented data', async () => {
    const { token } = await registerAndLogin()
    const { api } = makeApp({ fail: true })
    const f = await api().get('/api/weather/forecast?latitude=23.8&longitude=90.4').set(bearer(token))
    expect(f.status).toBe(200)
    expect(f.body.data).toMatchObject({ status: 'provider_unavailable' })
    expect(f.body.data).not.toHaveProperty('current')
    expect((await api().get('/api/locations/search?q=Dhaka').set(bearer(token))).body.data).toMatchObject({ status: 'provider_unavailable', results: [] })
    expect((await api().get('/api/places/nearby?latitude=23.8&longitude=90.4').set(bearer(token))).body.data).toMatchObject({ status: 'provider_unavailable', places: [] })
  })
  it('repeated identical requests are served from the cache (one provider call)', async () => {
    const { token } = await registerAndLogin()
    const { api, fetchFn } = makeApp()
    for (let i = 0; i < 3; i++) await api().get('/api/weather/forecast?latitude=23.8&longitude=90.4').set(bearer(token))
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
  it('is rate limited per client so the providers cannot be hammered', async () => {
    const { token } = await registerAndLogin()
    const app = createApp({ authRateLimit: { limit: 1000 }, exploreRateLimit: { limit: 2 }, exploreOptions: { fetchFn: async () => json(geo) } })
    const codes = []
    for (let i = 0; i < 4; i++) codes.push((await request(app).get('/api/locations/search?q=Dhaka').set(bearer(token))).status)
    expect(codes).toEqual([200, 200, 429, 429])
  })
})
