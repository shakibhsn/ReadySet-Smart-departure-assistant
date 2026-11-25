import { useState } from 'react'
import { AlertTriangle, CloudOff, Droplets, Gauge, Lightbulb, MapPin, RefreshCw, Sunrise, Sunset, Thermometer, Wind } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { Skeleton } from '@/components/common/LoadingSkeleton'
import { SegmentedControl } from '@/components/common/SegmentedControl'
import { WeatherIcon } from '@/components/weather/WeatherIcon'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatTemp, loadUnit, saveUnit } from '@/lib/weatherLocation'
import { formatDayLabel, formatRelative, formatTime12 } from '@/utils/format'

const NA = 'Not available'
const clock = (iso) => (typeof iso === 'string' && iso.length >= 16 ? formatTime12(iso.slice(11, 16)) : NA)

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="size-4 shrink-0 text-brand-600" aria-hidden="true" />
      <dt className="text-muted">{label}</dt>
      <dd className="ml-auto font-semibold text-ink sm:ml-1">{value}</dd>
    </div>
  )
}

/**
 * Pure presentation of a forecast reply (testable). `unit` is 'C' | 'F': the forecast is always loaded in Celsius and
 * converted here, so switching units never needs another request.
 */
export function ForecastView({ forecast, unit, compact = false }) {
  const { current, today, hourly, daily, advice = [] } = forecast
  const t = (c) => formatTemp(c, unit)
  const hours = hourly.slice(0, compact ? 12 : 24)
  const days = daily.slice(0, 7)
  return (
    <div className="space-y-5">
      {forecast.stale && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>Not current: the weather service is not responding. This forecast was loaded {formatRelative(forecast.fetchedAt)}.</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-linear-to-br from-amber-50 to-amber-100 text-amber-500 ring-1 ring-inset ring-amber-200">
          <WeatherIcon icon={current.icon} isDay={current.isDay} className="size-9" />
        </span>
        <div>
          <p className="text-4xl font-extrabold tracking-tight" aria-label={`Current temperature ${t(current.temperatureC)}`}>{t(current.temperatureC)}</p>
          <p className="text-sm text-muted">{current.condition}</p>
        </div>
        <dl className="grid w-full grid-cols-1 gap-x-6 gap-y-2 sm:ml-auto sm:w-auto sm:grid-cols-2">
          <Stat icon={Thermometer} label="Feels like" value={t(current.feelsLikeC)} />
          <Stat icon={Thermometer} label="Min / max" value={today ? `${t(today.minC)} / ${t(today.maxC)}` : NA} />
          <Stat icon={Droplets} label="Chance of rain" value={current.rainChancePercent === null ? NA : `${current.rainChancePercent}%`} />
          <Stat icon={Wind} label="Wind" value={current.windSpeedKmh === null ? NA : `${current.windSpeedKmh} km/h`} />
          <Stat icon={Gauge} label="Humidity" value={current.humidityPercent === null ? NA : `${current.humidityPercent}%`} />
          {!compact && <Stat icon={Sunrise} label="Sunrise" value={clock(today?.sunrise)} />}
          {!compact && <Stat icon={Sunset} label="Sunset" value={clock(today?.sunset)} />}
        </dl>
      </div>

      {advice.length > 0 && (
        <ul className="space-y-2" aria-label="Weather suggestions">
          {advice.map((a) => (
            <li key={a.id} className={a.severity === 'warning' ? 'flex gap-2 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700' : 'flex gap-2 rounded-xl bg-accent-50 p-3 text-sm text-accent-700'}>
              {a.severity === 'warning' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <Lightbulb className="mt-0.5 size-4 shrink-0" />}
              <span>{a.message}</span>
            </li>
          ))}
        </ul>
      )}

      {hours.length > 0 && (
        <section aria-label={compact ? 'Next hours' : 'Next 24 hours'}>
          <h3 className="mb-2 text-sm font-bold text-ink">{compact ? 'Next hours' : 'Next 24 hours'}</h3>
          <ol className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
            {hours.map((h) => (
              <li key={h.time} className="flex w-16 shrink-0 flex-col items-center gap-1 rounded-xl border border-line bg-canvas p-2 text-center">
                <span className="text-xs font-semibold text-muted">{clock(h.time)}</span>
                <WeatherIcon icon={h.icon} className="size-5 text-amber-500" />
                <span className="text-sm font-bold">{t(h.temperatureC)}</span>
                <span className="text-[11px] text-muted">{h.rainChancePercent === null ? NA : `${h.rainChancePercent}% rain`}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {!compact && days.length > 0 && (
        <section aria-label="Daily forecast">
          <h3 className="mb-2 text-sm font-bold text-ink">Next {days.length} days</h3>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {days.map((d) => (
              <li key={d.date} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-24 shrink-0 font-semibold">{formatDayLabel(d.date)}</span>
                <WeatherIcon icon={d.icon} className="size-5 shrink-0 text-amber-500" />
                <span className="hidden min-w-0 flex-1 truncate text-muted sm:block">{d.condition}</span>
                <span className="ml-auto flex items-center gap-1 text-xs text-muted"><Droplets className="size-3.5" aria-hidden="true" />{d.rainChancePercent === null ? NA : `${d.rainChancePercent}%`}</span>
                <span className="w-24 shrink-0 text-right font-semibold">{t(d.minC)} / {t(d.maxC)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted">
        Forecast by Open-Meteo{forecast.timezone ? ` (times in ${forecast.timezone})` : ''} · {forecast.stale ? 'loaded' : 'updated'} {formatRelative(forecast.fetchedAt)}
      </p>
    </div>
  )
}

/** Weather for the chosen location. `query` is the result of useForecast(location). */
export function LocationWeatherCard({ location, query, compact = false }) {
  const [unit, setUnit] = useState(loadUnit)
  const chooseUnit = (u) => {
    setUnit(u)
    saveUnit(u)
  }
  const place = location ? [location.name, location.area].filter(Boolean).join(', ') : null
  const forecast = query?.data
  const failed = query?.error || (forecast && forecast.status !== 'ok')

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Weather</CardTitle>
          <CardDescription className="flex items-center gap-1">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{place ?? 'No location selected'}</span>
          </CardDescription>
        </div>
        {location && (
          <div className="flex shrink-0 items-center gap-2">
            <SegmentedControl label="Temperature unit" value={unit} onChange={chooseUnit} options={[{ value: 'C', label: '°C' }, { value: 'F', label: '°F' }]} />
            <Button variant="ghost" size="sm" onClick={query?.reload} disabled={query?.loading} aria-label="Refresh weather">
              <RefreshCw className={query?.loading ? 'size-4 animate-spin' : 'size-4'} />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {!location ? (
          <EmptyState icon={MapPin} title="Choose a location" description="Pick a place in Bangladesh to see its weather and forecast." action={<ButtonLink to="/explore">Choose location</ButtonLink>} className="py-8" />
        ) : query.loading && !forecast ? (
          <div role="status" aria-label="Loading weather" className="space-y-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-20" />
          </div>
        ) : failed ? (
          <div className="flex items-start gap-3 rounded-xl bg-canvas p-4 text-sm text-muted">
            <CloudOff className="mt-0.5 size-5 shrink-0" />
            <p>
              {forecast?.message ?? 'Weather is unavailable right now.'}{' '}
              <button type="button" onClick={query.reload} className="font-bold text-brand-700 underline">Try again</button>
            </p>
          </div>
        ) : (
          <ForecastView forecast={forecast} unit={unit} compact={compact} />
        )}
      </CardContent>
    </Card>
  )
}

