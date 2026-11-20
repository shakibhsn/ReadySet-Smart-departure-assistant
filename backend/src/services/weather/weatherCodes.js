// WMO weather interpretation codes (as used by Open-Meteo) -> a label and an icon key the frontend maps to an icon.
const TABLE = [
  [[0], 'Clear sky', 'clear'],
  [[1, 2], 'Partly cloudy', 'partly-cloudy'],
  [[3], 'Overcast', 'cloudy'],
  [[45, 48], 'Fog', 'fog'],
  [[51, 53, 55, 56, 57], 'Drizzle', 'drizzle'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'Rain', 'rain'],
  [[71, 73, 75, 77, 85, 86], 'Snow', 'snow'],
  [[95, 96, 99], 'Thunderstorm', 'thunder'],
]

export function describeWeatherCode(code) {
  const row = TABLE.find(([codes]) => codes.includes(code))
  return row ? { label: row[1], icon: row[2] } : { label: 'Unknown conditions', icon: 'unknown' }
}
