import { describeWeatherCode } from './weatherCodes.js'

export const MAX_GEOCODE_TRIES = 3

/** "Room 5, Dhaka University, Dhaka" -> tries the full text, then the last parts (usually the city). */
export function locationCandidates(destination) {
  const full = destination.trim().replace(/\s+/g, ' ')
  const parts = full.split(',').map((p) => p.trim()).filter((p) => p.length >= 2)
  return [...new Set([full, ...parts.reverse()])].slice(0, MAX_GEOCODE_TRIES)
}

const num = (v) => (Number.isFinite(v) ? v : null)

/** Pure: pick the hourly slot for the event start from a provider response (null if absent / empty). */
export function pickHour(body, eventStart) {
  const h = body.hourly
  // Slots are LOCAL to the destination; shift the event instant into that local time and match "yyyy-MM-ddTHH:00".
  const local = new Date(eventStart.getTime() + body.utc_offset_seconds * 1000).toISOString().slice(0, 13) + ':00'
  const i = h.time.indexOf(local)
  if (i < 0) return null
  const temp = num(h.temperature_2m?.[i])
  const code = num(h.weather_code?.[i])
  if (temp === null && code === null) return null
  const { label, icon } = describeWeatherCode(code)
  return {
    forecastTime: new Date(Date.parse(`${local}:00Z`) - body.utc_offset_seconds * 1000).toISOString(),
    localTime: local,
    temperatureC: temp === null ? null : Math.round(temp),
    condition: label,
    icon,
    rainChancePercent: num(h.precipitation_probability?.[i]),
    windSpeedKmh: num(h.wind_speed_10m?.[i]) === null ? null : Math.round(h.wind_speed_10m[i]),
  }
}
