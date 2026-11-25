// Weather-aware destination suggestions: SIMPLE, VISIBLE rules over the real forecast. No AI, no hidden scoring.
// Wording is deliberately cautious ("may suit", "likely"): a destination is never called safe, dry or guaranteed.
// If there is no forecast value for the time in question, NO weather claim is made at all.

export const INDOOR = ['cafe', 'restaurant', 'museum', 'shopping']
export const OUTDOOR = ['park', 'nature', 'attraction']

export const RULES = { rainChancePercent: 50, hotC: 34, severeWindKmh: 50, pleasantMinC: 15, pleasantMaxC: 32, pleasantMaxRain: 30, pleasantMaxWindKmh: 35 }

/** "YYYY-MM-DDTHH:00" of an instant as seen in `timeZone` (forecast slots are local to the place). */
export function localHourKey(instant, timeZone) {
  const d = new Date(instant)
  if (Number.isNaN(d.getTime())) return null
  let parts
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d)
  } catch {
    return null // unknown time zone name
  }
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:00`
}

/** The forecast hour for `when` ('now' = the first hourly slot), or null when the forecast does not cover it. */
export function hourAt(forecast, when = 'now') {
  if (!forecast || forecast.status !== 'ok' || !Array.isArray(forecast.hourly) || forecast.hourly.length === 0) return null
  if (when === 'now') return forecast.hourly[0]
  const key = localHourKey(when, forecast.timezone)
  return (key && forecast.hourly.find((h) => h.time === key)) || null
}

/** What kind of weather is it? 'advisory' | 'indoor' | 'outdoor' | 'neutral' | 'unavailable', with the reason shown to the user. */
export function conditionsFor(hour) {
  if (!hour) return { mode: 'unavailable', reason: null }
  const wind = hour.windSpeedKmh
  const rain = hour.rainChancePercent
  const temp = hour.temperatureC
  const rainy = (rain !== null && rain >= RULES.rainChancePercent) || hour.icon === 'rain' || hour.icon === 'drizzle' || hour.icon === 'thunder'
  if (hour.severeCondition || (wind !== null && wind >= RULES.severeWindKmh)) {
    const why = hour.severeCondition ? hour.condition.toLowerCase() : `strong wind (${wind} km/h)`
    return { mode: 'advisory', reason: `Severe weather is possible around that time: ${why}. Check local conditions before you travel.` }
  }
  if (rainy) return { mode: 'indoor', reason: rain !== null ? `Rain is likely around that time (${rain}% chance). Consider an indoor destination.` : 'Rain is forecast around that time. Consider an indoor destination.' }
  if (temp !== null && temp >= RULES.hotC) return { mode: 'indoor', reason: `It is forecast to be hot (${temp}°C). An indoor or shaded destination may be more comfortable.` }
  const pleasant = temp !== null && temp >= RULES.pleasantMinC && temp <= RULES.pleasantMaxC && (rain === null || rain < RULES.pleasantMaxRain) && (wind === null || wind < RULES.pleasantMaxWindKmh)
  if (pleasant) return { mode: 'outdoor', reason: `The forecast looks pleasant around that time (${temp}°C${rain !== null ? `, ${rain}% chance of rain` : ''}). Parks and outdoor places may suit.` }
  return { mode: 'neutral', reason: null }
}

/** How one destination category fits the conditions: { fit: 'suits' | 'caution' | null, reason } (never "safe" or "guaranteed"). */
export function fitFor(mode, category) {
  if (mode === 'indoor') {
    if (INDOOR.includes(category)) return { fit: 'suits', reason: 'Indoor: may suit the forecast.' }
    if (OUTDOOR.includes(category)) return { fit: 'caution', reason: 'Outdoor: the forecast may not suit this around that time.' }
  }
  if (mode === 'outdoor' && OUTDOOR.includes(category)) return { fit: 'suits', reason: 'Outdoor: the forecast looks suitable around that time.' }
  if (mode === 'advisory' && OUTDOOR.includes(category)) return { fit: 'caution', reason: 'Outdoor: severe weather is possible around that time.' }
  return { fit: null, reason: null }
}

/** Highest-priority advisory for a planned travel time, or null. Needs a real forecast hour. */
export function advisoryFor(hour) {
  const c = conditionsFor(hour)
  if (c.mode === 'advisory') return { severity: 'warning', message: c.reason }
  if (hour && hour.rainChancePercent !== null && hour.rainChancePercent >= 70) return { severity: 'info', message: `Rain is likely around your planned departure time (${hour.rainChancePercent}% chance). Consider an umbrella and some extra time.` }
  return null
}

/** Category filter: 'all' keeps everything. */
export const filterByCategory = (places, category) => (category === 'all' ? places : places.filter((p) => p.category === category))

export const formatDistance = (meters) => (meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`)

export const EXPLORE_CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'cafe', label: 'Cafes' },
  { value: 'restaurant', label: 'Restaurants' },
  { value: 'park', label: 'Parks' },
  { value: 'attraction', label: 'Attractions' },
  { value: 'museum', label: 'Museums' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'nature', label: 'Nature' },
  { value: 'useful', label: 'Useful places' },
]
