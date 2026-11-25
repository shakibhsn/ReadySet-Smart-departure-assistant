import { adviceFor } from '../weather/weatherHelpers.js'
import { describeWeatherCode } from '../weather/weatherCodes.js'

// PURE: turns an Open-Meteo forecast response into the shape the dashboard shows. Every value comes from the response;
// anything the provider did not send is null (the UI shows "Not available"). Nothing is estimated or filled in.

export const HOURS_SHOWN = 48
export const DAYS_SHOWN = 7

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const rounded = (v) => (num(v) === null ? null : Math.round(v))
const at = (arr, i) => (Array.isArray(arr) ? arr[i] : undefined)
const text = (v) => (typeof v === 'string' && v.length > 0 ? v : null)

export const FORECAST_PARAMS = {
  current: 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,wind_speed_10m',
  hourly: 'temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m',
  daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset',
  timezone: 'auto',
  forecast_days: String(DAYS_SHOWN),
  temperature_unit: 'celsius',
  wind_speed_unit: 'kmh',
}

const condition = (code) => describeWeatherCode(num(code))

/** Throws only if the response is not a forecast at all (the caller then reports the provider as unavailable). */
export function buildForecast(body) {
  const h = body?.hourly
  if (!h || !Array.isArray(h.time) || !body.current || typeof body.current.time !== 'string') throw new Error('not a forecast')

  // Hourly slots start at the CURRENT local hour of the location (slots are local to the place, not to the server).
  const startKey = `${body.current.time.slice(0, 13)}:00`
  let start = h.time.findIndex((t) => t >= startKey)
  if (start < 0) start = h.time.length
  const hourly = h.time.slice(start, start + HOURS_SHOWN).map((time, k) => {
    const i = start + k
    const c = condition(at(h.weather_code, i))
    return {
      time,
      temperatureC: rounded(at(h.temperature_2m, i)),
      feelsLikeC: rounded(at(h.apparent_temperature, i)),
      rainChancePercent: rounded(at(h.precipitation_probability, i)),
      windSpeedKmh: rounded(at(h.wind_speed_10m, i)),
      condition: c.label,
      icon: c.icon,
      severeCondition: c.severe,
    }
  })

  const d = body.daily
  const daily = Array.isArray(d?.time)
    ? d.time.slice(0, DAYS_SHOWN).map((date, i) => {
        const c = condition(at(d.weather_code, i))
        return {
          date,
          minC: rounded(at(d.temperature_2m_min, i)),
          maxC: rounded(at(d.temperature_2m_max, i)),
          rainChancePercent: rounded(at(d.precipitation_probability_max, i)),
          windMaxKmh: rounded(at(d.wind_speed_10m_max, i)),
          sunrise: text(at(d.sunrise, i)),
          sunset: text(at(d.sunset, i)),
          condition: c.label,
          icon: c.icon,
          severeCondition: c.severe,
        }
      })
    : []

  const cur = body.current
  const cc = condition(cur.weather_code)
  const current = {
    time: cur.time,
    temperatureC: rounded(cur.temperature_2m),
    feelsLikeC: rounded(cur.apparent_temperature),
    humidityPercent: rounded(cur.relative_humidity_2m),
    windSpeedKmh: rounded(cur.wind_speed_10m),
    precipitationMm: num(cur.precipitation),
    rainChancePercent: hourly[0]?.rainChancePercent ?? null, // the provider's chance for the current hour
    isDay: cur.is_day === 1 ? true : cur.is_day === 0 ? false : null,
    condition: cc.label,
    icon: cc.icon,
    severeCondition: cc.severe,
  }
  const today = daily[0] ?? null

  return {
    timezone: text(body.timezone),
    current,
    today: today && { minC: today.minC, maxC: today.maxC, rainChancePercent: today.rainChancePercent, sunrise: today.sunrise, sunset: today.sunset },
    hourly,
    daily,
    advice: adviceFor(current), // the same fixed, visible rules used for event weather
  }
}
