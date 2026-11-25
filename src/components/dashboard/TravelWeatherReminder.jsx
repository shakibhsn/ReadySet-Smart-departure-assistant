import { AlertTriangle, CloudSun, Lightbulb } from 'lucide-react'
import { Link } from 'react-router-dom'
import { advisoryFor, conditionsFor, hourAt } from '@/lib/exploreRules'
import { formatTemp, loadUnit } from '@/lib/weatherLocation'
import { cn } from '@/lib/utils'

/**
 * Weather-aware travel reminder: the forecast for the hour of the user's next planned departure, at their chosen weather
 * location, with the same visible rules used on the Explore page. Shown ONLY when there is a real forecast value for that
 * hour: otherwise nothing is claimed (and nothing is shown).
 */
export function TravelWeatherReminder({ location, forecast, plan }) {
  if (!location || !plan) return null
  const hour = hourAt(forecast, plan.plan.departureTime)
  if (!hour) return null
  const unit = loadUnit()
  const advisory = advisoryFor(hour)
  const conditions = conditionsFor(hour)
  const message = advisory?.message ?? conditions.reason
  const warning = advisory?.severity === 'warning'
  return (
    <section aria-label="Weather for your departure" className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><CloudSun className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-ink">Weather for your departure</h2>
          <p className="mt-0.5 text-sm text-muted">
            {plan.event.title ?? 'Your next event'}: leave at {plan.local.departureTime.time12}. Forecast for {location.name} around then: {formatTemp(hour.temperatureC, unit)}, {hour.condition}
            {hour.rainChancePercent === null ? '' : `, ${hour.rainChancePercent}% chance of rain`}.
          </p>
          {message && (
            <p role={warning ? 'alert' : 'status'} className={cn('mt-2 flex items-start gap-2 rounded-xl p-2.5 text-sm', warning ? 'bg-rose-50 font-medium text-rose-700' : 'bg-accent-50 text-accent-700')}>
              {warning ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <Lightbulb className="mt-0.5 size-4 shrink-0" />}
              <span>{message}</span>
            </p>
          )}
          <p className="mt-2 text-xs text-muted">Based on your chosen weather location, not necessarily your destination. <Link to="/explore" className="font-semibold text-brand-700 hover:underline">Change location</Link></p>
        </div>
      </div>
    </section>
  )
}
