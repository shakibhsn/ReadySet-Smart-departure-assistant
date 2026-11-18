import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Compact vertical timeline of the computed times.
 * `view` is a plan returned by the backend departure engine (POST /departure/preview or a saved plan);
 * this component only displays it, it never calculates anything.
 */
export function DeparturePreview({ view, loading = false, error = null, title = 'Your timeline' }) {
  const local = view?.local
  const eventDate = local?.eventStart.date
  const steps = local && [
    { label: 'Start preparing', at: local.preparationStart, dot: 'bg-brand-300' },
    { label: 'Leave home', at: local.departureTime, dot: 'bg-brand-600', strong: true },
    { label: 'Target arrival', at: local.targetArrival, dot: 'bg-accent-500' },
    { label: 'Event starts', at: local.eventStart, dot: 'bg-slate-300' },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p role="alert" className="rounded-xl bg-canvas p-4 text-sm text-muted">Could not calculate the preview right now. Your event can still be saved.</p>
        ) : !steps ? (
          <p className="rounded-xl bg-canvas p-4 text-sm text-muted">
            {loading ? 'Calculating…' : 'Pick a date and start time and enter a travel duration to preview your departure.'}
          </p>
        ) : (
          <ol aria-busy={loading} className={cn('relative space-y-5 pl-6 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-0.5 before:bg-line', loading && 'opacity-60')}>
            {steps.map(({ label, at, dot, strong }) => (
              <li key={label} className="relative flex items-center justify-between gap-3">
                <span className={cn('absolute -left-6 size-4 rounded-full ring-4 ring-surface', dot)} aria-hidden="true" />
                <span className={cn('text-sm', strong ? 'font-bold text-ink' : 'text-muted')}>{label}</span>
                <span className={cn('tabular-nums', strong ? 'text-lg font-extrabold text-brand-700' : 'text-sm font-semibold')}>
                  {at.time12}
                  {at.date !== eventDate && <span className="ml-1 text-xs font-medium text-muted">({at.date < eventDate ? 'day before' : 'day after'})</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
        {steps && <p className="mt-4 text-xs text-muted">Times shown in {local.timezone}.</p>}
      </CardContent>
    </Card>
  )
}
