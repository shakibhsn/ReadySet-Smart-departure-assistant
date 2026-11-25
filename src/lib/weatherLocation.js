// The user's chosen weather location and temperature unit.
//
// STORAGE (temporary): ReadySet has no database field that can hold a coordinate location (saved places are address text
// only, and user_preferences has no location columns). Until a schema change is approved (see docs/WEATHER_EXPLORE.md),
// the choice is kept in this browser's localStorage, keyed by user id, so it survives reloads and logging out and in
// on this device, and one user's choice is never shown to another. All access goes through this file, so moving to
// server-side storage later changes only this module.

const KEY = (userId) => `readyset.weatherLocation.v1:${userId}`
const UNIT_KEY = 'readyset.temperatureUnit'
const EVENT = 'readyset:weather-location'

const safe = (fn, fallback = null) => {
  try {
    return fn()
  } catch {
    return fallback // storage blocked (private mode) or full: the choice just won't persist
  }
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const text = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Only a well-formed location is ever read back or written (a tampered value is ignored). */
export function normalizeLocation(raw) {
  if (!raw || typeof raw !== 'object') return null
  const latitude = raw.latitude
  const longitude = raw.longitude
  const name = text(raw.name)
  if (!name || !isNum(latitude) || !isNum(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  return { name, area: text(raw.area, 200) || null, latitude, longitude, country: text(raw.country) || null, source: raw.source === 'gps' ? 'gps' : 'search' }
}

export function loadLocation(userId) {
  if (!userId) return null
  return normalizeLocation(safe(() => JSON.parse(window.localStorage.getItem(KEY(userId)) ?? 'null')))
}

export function saveLocation(userId, location) {
  const clean = normalizeLocation(location)
  if (!userId || !clean) return null
  safe(() => window.localStorage.setItem(KEY(userId), JSON.stringify(clean)))
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { userId } }))
  return clean
}

export function clearLocation(userId) {
  if (!userId) return
  safe(() => window.localStorage.removeItem(KEY(userId)))
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { userId } }))
}

export const subscribeLocation = (fn) => {
  window.addEventListener(EVENT, fn)
  window.addEventListener('storage', fn)
  return () => {
    window.removeEventListener(EVENT, fn)
    window.removeEventListener('storage', fn)
  }
}

export const loadUnit = () => (safe(() => window.localStorage.getItem(UNIT_KEY)) === 'F' ? 'F' : 'C')
export const saveUnit = (unit) => safe(() => window.localStorage.setItem(UNIT_KEY, unit === 'F' ? 'F' : 'C'))

export const toFahrenheit = (c) => (c === null || c === undefined ? null : Math.round((c * 9) / 5 + 32))
export const formatTemp = (c, unit = 'C') => (c === null || c === undefined ? 'Not available' : `${unit === 'F' ? toFahrenheit(c) : c}°${unit}`)
