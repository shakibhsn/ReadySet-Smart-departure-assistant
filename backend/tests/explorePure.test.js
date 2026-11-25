import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildForecast } from '../src/services/explore/forecastHelpers.js'
import { clearForecastCache, getLocationForecast, STALE_LIMIT_MS } from '../src/services/explore/forecast.service.js'
import { areaParts, mapHit, mapResults, typeLabelOf } from '../src/services/explore/locationHelpers.js'
import { clearLocationCache, searchLocations } from '../src/services/explore/locationSearch.service.js'
import { buildQuery, CATEGORIES, categoryOf, addressOf, haversineMeters, mapElements } from '../src/services/explore/nearbyHelpers.js'
import { clearNearbyCache, findNearby } from '../src/services/explore/nearby.service.js'

const NOW = new Date('2030-05-10T06:00:00.000Z')
const later = (ms) => new Date(NOW.getTime() + ms)
const json = (body, ok = true, status = 200) => ({ ok, status, json: async () => body })
const failing = (name = 'TypeError') => vi.fn(async () => { throw Object.assign(new Error('x'), { name }) })

beforeEach(() => {
  clearLocationCache()
  clearForecastCache()
  clearNearbyCache()
})

// ---------------- location search ----------------

describe('location helpers', () => {
  const hit = { id: 1185241, name: 'Savar', latitude: 23.85, longitude: 90.26, feature_code: 'PPLA3', country_code: 'BD', country: 'Bangladesh', admin1: 'Dhaka Division', admin2: 'Dhaka', admin3: 'Savar' }
  it('maps a provider hit and tells same-named places apart by their area (never repeating the name)', () => {
    const p = mapHit(hit)
    expect(p).toMatchObject({ id: '1185241', name: 'Savar', admin1: 'Dhaka Division', admin2: 'Dhaka', country: 'Bangladesh', countryCode: 'BD', type: 'Upazila seat', latitude: 23.85, longitude: 90.26 })
    expect(p.area).toBe('Dhaka, Dhaka Division, Bangladesh')
    const other = mapHit({ ...hit, id: 2, admin1: 'Barisal Division', admin2: 'Barguna', admin3: undefined })
    expect(other.area).toBe('Barguna, Barisal Division, Bangladesh')
    expect(other.area).not.toBe(p.area)
  })
  it('rejects hits without usable coordinates or name; unknown feature codes get no invented type', () => {
    expect(mapHit({ name: 'X', latitude: null, longitude: 90 })).toBeNull()
    expect(mapHit({ name: 'X', latitude: 95, longitude: 90 })).toBeNull()
    expect(mapHit({ name: '', latitude: 1, longitude: 1 })).toBeNull()
    expect(mapHit({ name: 'X', latitude: 1, longitude: 1, feature_code: 'ZZZZ' }).type).toBeNull()
    expect(typeLabelOf('ADM2')).toBe('District')
  })
  it('de-duplicates by id and by same name at the same spot, keeping the provider order', () => {
    const res = mapResults([hit, { ...hit }, { ...hit, id: 99 }, { ...hit, id: 3, name: 'Savar Cantonment', latitude: 23.9 }, { name: 'bad' }])
    expect(res.map((r) => r.id)).toEqual(['1185241', '3'])
  })
  it('areaParts skips empty and repeated parts', () => {
    expect(areaParts({ name: 'Dhaka', admin2: 'Dhaka', admin1: 'Dhaka Division', country: 'Bangladesh' })).toEqual(['Dhaka Division', 'Bangladesh'])
  })
})

describe('searchLocations (Open-Meteo Geocoding)', () => {
  const result = { results: [{ id: 1, name: 'Sylhet', latitude: 24.9, longitude: 91.87, country: 'Bangladesh', country_code: 'BD', admin1: 'Sylhet Division', admin2: 'Sylhet', feature_code: 'PPLA' }] }
  it('searches Bangladesh by default (countryCode=BD) and maps the results', async () => {
    const f = vi.fn(async () => json(result))
    const r = await searchLocations({ q: 'Sylhet' }, NOW, f)
    expect(r.status).toBe('ok')
    expect(r.results[0]).toMatchObject({ name: 'Sylhet', type: 'Division capital' })
    const url = new URL(f.mock.calls[0][0])
    expect(url.origin + url.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search')
    expect(url.searchParams.get('countryCode')).toBe('BD')
    expect(url.searchParams.get('name')).toBe('Sylhet')
  })
  it('can search anywhere (no country filter) when asked', async () => {
    const f = vi.fn(async () => json(result))
    await searchLocations({ q: 'Sylhet', country: 'ANY' }, NOW, f)
    expect(new URL(f.mock.calls[0][0]).searchParams.has('countryCode')).toBe(false)
  })
  it('caches repeated searches and shares concurrent identical ones: one provider call', async () => {
    const f = vi.fn(async () => json(result))
    await Promise.all([searchLocations({ q: 'Sylhet' }, NOW, f), searchLocations({ q: 'sylhet' }, NOW, f)])
    await searchLocations({ q: 'Sylhet' }, later(60_000), f)
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('no matches is an ordinary empty result (the provider omits "results")', async () => {
    const r = await searchLocations({ q: 'Zzzzzz' }, NOW, vi.fn(async () => json({ generationtime_ms: 0.4 })))
    expect(r).toMatchObject({ status: 'ok', results: [] })
  })
  it.each([
    ['timeout', failing('TimeoutError'), 'timeout'],
    ['network failure', failing('TypeError'), 'provider_unavailable'],
    ['HTTP 500', vi.fn(async () => json({}, false, 500)), 'provider_unavailable'],
    ['invalid JSON', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad') } })), 'provider_unavailable'],
  ])('a provider %s becomes a normal reply with a status, never a crash', async (_n, f, status) => {
    const r = await searchLocations({ q: 'Dhaka' }, NOW, f)
    expect(r).toMatchObject({ status, results: [] })
    expect(r.message).toBeTruthy()
  })
  it('a failure is not cached: the next search tries again', async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError('x')).mockResolvedValue(json(result))
    expect((await searchLocations({ q: 'Sylhet' }, NOW, f)).status).toBe('provider_unavailable')
    expect((await searchLocations({ q: 'Sylhet' }, NOW, f)).status).toBe('ok')
  })
})

// ---------------- forecast ----------------

const forecastBody = (over = {}) => ({
  timezone: 'Asia/Dhaka',
  utc_offset_seconds: 21600,
  current: { time: '2030-05-10T12:15', temperature_2m: 31.6, apparent_temperature: 36.2, relative_humidity_2m: 74, is_day: 1, precipitation: 0.2, weather_code: 61, wind_speed_10m: 14.4 },
  hourly: {
    time: ['2030-05-10T10:00', '2030-05-10T11:00', '2030-05-10T12:00', '2030-05-10T13:00', '2030-05-10T14:00'],
    temperature_2m: [29, 30, 31.4, 32.2, 33], apparent_temperature: [33, 34, 36, 37, 38], precipitation_probability: [10, 20, 65, 70, 30], weather_code: [1, 3, 61, 63, 2], wind_speed_10m: [10, 12, 14, 15, 20],
  },
  daily: { time: ['2030-05-10', '2030-05-11'], weather_code: [61, 1], temperature_2m_max: [33.4, 34], temperature_2m_min: [26.1, 25.5], precipitation_probability_max: [70, 20], wind_speed_10m_max: [22, 18], sunrise: ['2030-05-10T05:22', '2030-05-11T05:21'], sunset: ['2030-05-10T18:21', '2030-05-11T18:21'] },
  ...over,
})

describe('buildForecast', () => {
  const f = buildForecast(forecastBody())
  it('current conditions come straight from the provider (rounded, nothing invented)', () => {
    expect(f.current).toMatchObject({ temperatureC: 32, feelsLikeC: 36, humidityPercent: 74, windSpeedKmh: 14, condition: 'Rain', icon: 'rain', isDay: true, rainChancePercent: 65 })
  })
  it('hourly forecast starts at the CURRENT local hour of the location, not at midnight', () => {
    expect(f.hourly[0]).toMatchObject({ time: '2030-05-10T12:00', rainChancePercent: 65, temperatureC: 31 })
    expect(f.hourly).toHaveLength(3)
  })
  it('today and daily rows carry min/max, rain chance, sunrise and sunset when provided', () => {
    expect(f.today).toMatchObject({ minC: 26, maxC: 33, rainChancePercent: 70, sunrise: '2030-05-10T05:22', sunset: '2030-05-10T18:21' })
    expect(f.daily).toHaveLength(2)
  })
  it('weather advice reuses the visible event-weather rules', () => {
    expect(f.advice.map((a) => a.id)).toContain('RAIN')
  })
  it('missing fields become null (shown as "Not available"), not zero', () => {
    const g = buildForecast(forecastBody({ daily: undefined, current: { time: '2030-05-10T12:15' } }))
    expect(g.current).toMatchObject({ temperatureC: null, humidityPercent: null, windSpeedKmh: null, isDay: null })
    expect(g.today).toBeNull()
    expect(g.daily).toEqual([])
  })
  it('a reply that is not a forecast throws', () => {
    expect(() => buildForecast({})).toThrow()
    expect(() => buildForecast({ hourly: { time: [] } })).toThrow()
  })
})

describe('getLocationForecast', () => {
  const at = { latitude: 23.8103, longitude: 90.4125 }
  it('fetches, labels when it was loaded, and asks only for coordinates', async () => {
    const f = vi.fn(async () => json(forecastBody()))
    const r = await getLocationForecast(at, NOW, f)
    expect(r).toMatchObject({ status: 'ok', stale: false, fetchedAt: NOW.toISOString(), location: at })
    const url = new URL(f.mock.calls[0][0])
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    expect([...url.searchParams.keys()].some((k) => /user|email|token|name/i.test(k))).toBe(false)
    expect(url.searchParams.get('latitude')).toBe('23.8103')
  })
  it('caches for 10 minutes per ~1 km cell', async () => {
    const f = vi.fn(async () => json(forecastBody()))
    await getLocationForecast(at, NOW, f)
    await getLocationForecast({ latitude: 23.8149, longitude: 90.4101 }, later(5 * 60_000), f) // same cell
    expect(f).toHaveBeenCalledTimes(1)
    await getLocationForecast(at, later(11 * 60_000), f)
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('if the provider fails, shows the last forecast ONLY if it is under 3 hours old, clearly labelled', async () => {
    const good = vi.fn(async () => json(forecastBody()))
    await getLocationForecast(at, NOW, good)
    const r = await getLocationForecast(at, later(30 * 60_000), failing())
    expect(r).toMatchObject({ status: 'ok', stale: true, fetchedAt: NOW.toISOString() })
    expect(r.message).toMatch(/not a current one/)
    const tooOld = await getLocationForecast(at, later(STALE_LIMIT_MS + 60_000), failing())
    expect(tooOld.status).toBe('provider_unavailable')
  })
  it.each([
    ['timeout', failing('TimeoutError'), 'timeout'],
    ['failure', failing(), 'provider_unavailable'],
    ['not a forecast', vi.fn(async () => json({ hello: 1 })), 'provider_unavailable'],
    ['HTTP 429', vi.fn(async () => json({}, false, 429)), 'provider_unavailable'],
  ])('%s with nothing cached -> status %s, never an invented forecast', async (_n, f, status) => {
    const r = await getLocationForecast(at, NOW, f)
    expect(r.status).toBe(status)
    expect(r).not.toHaveProperty('current')
  })
})

// ---------------- nearby places ----------------

describe('nearby helpers', () => {
  it('haversine distance', () => {
    expect(Math.round(haversineMeters(0, 0, 0, 1) / 1000)).toBe(111)
    expect(haversineMeters(23.8, 90.4, 23.8, 90.4)).toBe(0)
  })
  it('builds an Overpass query for one category, named places only, with the radius', () => {
    const q = buildQuery({ lat: 23.81, lon: 90.41, radius: 2500, category: 'cafe' })
    expect(q).toContain('around:2500,23.81,90.41')
    expect(q).toContain('["amenity"="cafe"]["name"]')
    expect(q).not.toContain('museum')
    expect(buildQuery({ lat: 1, lon: 1, radius: 500, category: 'all' })).toContain('["tourism"="museum"]')
  })
  it('classifies an element by its tags', () => {
    expect(categoryOf({ amenity: 'cafe' })).toBe('cafe')
    expect(categoryOf({ leisure: 'park' }, 'all')).toBe('park')
    expect(categoryOf({ leisure: 'park' }, 'cafe')).toBeNull()
    expect(categoryOf({ shop: 'bakery' })).toBeNull()
  })
  it('builds an address only from address tags that exist', () => {
    expect(addressOf({ 'addr:housenumber': '12', 'addr:street': 'Road 5', 'addr:suburb': 'Gulshan', 'addr:city': 'Dhaka' })).toBe('12 Road 5, Gulshan, Dhaka')
    expect(addressOf({ name: 'X' })).toBeNull()
  })
  const els = [
    { type: 'node', id: 1, lat: 23.8105, lon: 90.4125, tags: { name: 'Far Cafe', amenity: 'cafe' } },
    { type: 'node', id: 2, lat: 23.8104, lon: 90.4126, tags: { name: 'Near Cafe', amenity: 'cafe', 'addr:suburb': 'Gulshan', opening_hours: '24/7', 'contact:phone': '123', website: 'https://x.test' } },
    { type: 'way', id: 3, center: { lat: 23.82, lon: 90.42 }, tags: { name: 'Central Park', leisure: 'park' } },
    { type: 'node', id: 4, lat: 23.8104, lon: 90.4126, tags: { amenity: 'cafe' } }, // unnamed
    { type: 'node', id: 2, lat: 23.8104, lon: 90.4126, tags: { name: 'Near Cafe', amenity: 'cafe' } }, // duplicate
    { type: 'node', id: 5, tags: { name: 'No coordinates', amenity: 'cafe' } },
  ]
  it('keeps only named places with coordinates, sorts nearest first and de-duplicates', () => {
    const r = mapElements(els, { lat: 23.8103, lon: 90.4125, category: 'all' })
    expect(r.map((p) => p.name)).toEqual(['Near Cafe', 'Far Cafe', 'Central Park'])
    expect(r[0].distanceMeters).toBeLessThan(r[1].distanceMeters)
    expect(r[2]).toMatchObject({ category: 'park', categoryLabel: CATEGORIES.park.label, latitude: 23.82 })
  })
  it('never passes through opening hours, phone numbers, websites or invents ratings', () => {
    const near = mapElements(els, { lat: 23.8103, lon: 90.4125, category: 'cafe' })[0]
    expect(Object.keys(near).sort()).toEqual(['address', 'category', 'categoryLabel', 'distanceMeters', 'id', 'latitude', 'locality', 'longitude', 'name', 'osmUrl'])
    expect(near.address).toBe('Gulshan')
    expect(mapElements(els, { lat: 23.8103, lon: 90.4125, category: 'cafe' }).some((p) => p.name === 'Central Park')).toBe(false)
  })
  it('names from the provider are plain strings, trimmed and length-limited', () => {
    const r = mapElements([{ type: 'node', id: 9, lat: 1, lon: 1, tags: { name: `  ${'A'.repeat(300)}  `, amenity: 'cafe' } }], { lat: 1, lon: 1, category: 'cafe' })
    expect(r[0].name).toHaveLength(120)
  })
})

describe('findNearby (Overpass)', () => {
  const body = { elements: [{ type: 'node', id: 2, lat: 23.8104, lon: 90.4126, tags: { name: 'Near Cafe', amenity: 'cafe' } }] }
  const at = { latitude: 23.8103, longitude: 90.4125, radius: 2500, category: 'cafe' }
  it('POSTs one query to the configured Overpass URL, identifies the app, and returns attribution', async () => {
    const f = vi.fn(async () => json(body))
    const r = await findNearby(at, NOW, f, 'https://overpass.example/api/interpreter')
    expect(r).toMatchObject({ status: 'ok', category: 'cafe', radiusMeters: 2500, attribution: expect.stringContaining('OpenStreetMap') })
    expect(r.places[0]).toMatchObject({ name: 'Near Cafe', category: 'cafe' })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://overpass.example/api/interpreter')
    expect(init.method).toBe('POST')
    expect(init.headers['User-Agent']).toMatch(/ReadySet/)
    expect(decodeURIComponent(init.body)).toContain('amenity')
    expect(init.body).not.toMatch(/email|token|user/i)
  })
  it('caches per ~1 km cell but recomputes distance from the exact point each time', async () => {
    const f = vi.fn(async () => json(body))
    const a = await findNearby(at, NOW, f, 'https://o.example/x')
    const b = await findNearby({ ...at, latitude: 23.8149, longitude: 90.4101 }, later(60_000), f, 'https://o.example/x')
    expect(f).toHaveBeenCalledTimes(1)
    expect(b.places[0].distanceMeters).not.toBe(a.places[0].distanceMeters)
  })
  it('falls back to the next Overpass server when the first one is slow or failing', async () => {
    const f = vi.fn(async (url) => { if (url.includes('slow')) throw Object.assign(new Error('x'), { name: 'TimeoutError' }); return json(body) })
    const r = await findNearby(at, NOW, f, 'https://slow.example/api, https://mirror.example/api')
    expect(r.status).toBe('ok')
    expect(f.mock.calls.map((c) => c[0])).toEqual(['https://slow.example/api', 'https://mirror.example/api'])
  })
  it('reports the failure only when every server failed', async () => {
    const f = vi.fn(async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }) })
    expect(await findNearby(at, NOW, f, 'https://a.example/x,https://b.example/x')).toMatchObject({ status: 'timeout', places: [] })
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('an empty area is an ordinary empty result', async () => {
    expect(await findNearby(at, NOW, vi.fn(async () => json({ elements: [] })), 'https://o.example/x')).toMatchObject({ status: 'ok', places: [] })
  })
  it.each([
    ['timeout', failing('TimeoutError'), 'timeout'],
    ['network failure', failing(), 'provider_unavailable'],
    ['HTTP 429 (shared server busy)', vi.fn(async () => json({}, false, 429)), 'provider_unavailable'],
    ['HTTP 504', vi.fn(async () => json({}, false, 504)), 'provider_unavailable'],
    ['reply without elements', vi.fn(async () => json({ remark: 'runtime error: Query timed out' })), 'provider_unavailable'],
  ])('%s -> status %s with no invented places', async (_n, f, status) => {
    const r = await findNearby(at, NOW, f, 'https://o.example/x')
    expect(r).toMatchObject({ status, places: [] })
  })
})
