import { AlertTriangle, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudOff, CloudRain, CloudSnow, CloudSun, Droplets, Lightbulb, MapPin, Sun, Wind } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/common/LoadingSkeleton'
import { useEventQuery } from '@/hooks/useEventQuery'
import { getEventWeather } from '@/services/weatherApi'
import { formatDayLabel, formatRelative, formatTime12 } from '@/utils/format'

const ICONS = { clear: Sun, 'partly-cloudy': CloudSun, cloudy: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, thunder: CloudLightning, unknown: Cloud }

/** Pure presentation of a backend weather result (so it can be reused and tested). */
export function WeatherView({ weather, onRetry }) {
  if (weather.status !== 'ok') {
    const retry = weather.status === 'provider_unavailable' || weather.status === 'timeout'
    return (
      <div className="flex items-start gap-3 rounded-xl bg-canvas p-4 text-sm text-muted">
        <CloudOff className="mt-0.5 size-5 shrink-0" />
        <p>
          {weather.message ?? 'Weather is unavailable right now.'}{' '}
          {retry && onRetry && <button type="button" onClick={onRetry} className="font-bold text-brand-700 underline">Try again</button>}
        </p>
      </div>
    )
  }
  const { forecast, location } = weather
  const Icon = ICONS[forecast.icon] ?? Cloud
  const place = [location.name, location.country].filter(Boolean).join(', ')
  return (
    <>
      {weather.stale && (
        <p role="alert" className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>Not current: the weather service is not responding. This forecast was loaded {formatRelative(weather.fetchedAt)}.</span>
        </p>
      )}
      <div className="flex items-center gap-4">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-linear-to-br from-amber-50 to-amber-100 text-amber-500 ring-1 ring-inset ring-amber-200" aria-hidden="true">
          <Icon className="size-9" />
        </span>
        <div>
          <p className="text-4xl font-extrabold tracking-tight">{forecast.temperatureC === null ? '–' : `${forecast.temperatureC}°C`}</p>
          <p className="text-sm text-muted">{forecast.condition}</p>
        </div>
      </div>
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
        {forecast.rainChancePercent !== null && (
          <div className="inline-flex items-center gap-1.5">
            <Droplets className="size-4 text-sky-500" />
            <dt className="sr-only">Chance of rain</dt>
            <dd>{forecast.rainChancePercent}% chance of rain</dd>
          </div>
        )}
        {forecast.windSpeedKmh !== null && (
          <div className="inline-flex items-center gap-1.5">
            <Wind className="size-4 text-slate-500" />
            <dt className="sr-only">Wind</dt>
            <dd>{forecast.windSpeedKmh} km/h wind</dd>
          </div>
        )}
      </dl>
      {weather.advice?.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Weather suggestions">
          {weather.advice.map((a) => (
            <li key={a.id} className={a.severity === 'warning' ? 'flex gap-2 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700' : 'flex gap-2 rounded-xl bg-accent-50 p-3 text-sm text-accent-700'}>
              {a.severity === 'warning' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <Lightbulb className="mt-0.5 size-4 shrink-0" />}
              <span>{a.message}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">
        Forecast for {formatDayLabel(forecast.localTime.slice(0, 10))}, {formatTime12(forecast.localTime.slice(11, 16))} (local time at {place}) · {weather.stale ? 'loaded' : 'updated'} {formatRelative(weather.fetchedAt)}
      </p>
    </>
  )
}

/** Optional weather for one event's destination. Never blocks the page and never changes the departure plan. */
export function WeatherCard({ event }) {
  const query = useEventQuery(() => getEventWeather(event.id), [event.id, event.destination, event.startAt])
  const weather = query.data
  const place = weather?.status === 'ok' ? [weather.location.name, weather.location.region].filter(Boolean).join(', ') : event.destination
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Weather</CardTitle>
          <CardDescription className="flex items-center gap-1 truncate">
            {place ? <><MapPin className="size-3.5 shrink-0" /> <span className="truncate">{place}</span></> : 'At your destination'}
          </CardDescription>
        </div>
        <Badge className="bg-slate-100 text-slate-600 ring-slate-200">Info only</Badge>
      </CardHeader>
      <CardContent>
        {query.loading && !weather ? (
          <div role="status" aria-label="Loading weather" className="space-y-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : query.error ? (
          <WeatherView weather={{ status: 'provider_unavailable', message: 'Weather is unavailable right now.' }} onRetry={query.reload} />
        ) : (
          <WeatherView weather={weather} onRetry={query.reload} />
        )}
      </CardContent>
    </Card>
  )
}
