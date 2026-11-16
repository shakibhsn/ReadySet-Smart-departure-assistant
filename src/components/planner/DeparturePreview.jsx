import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatClock } from '@/utils/departure'
import { cn } from '@/lib/utils'

/** Compact vertical timeline of the three computed times. */
export function DeparturePreview({ plan, title = 'Your timeline' }) {
  const steps = [
    { label: 'Start preparing', time: plan?.prepStart, dot: 'bg-brand-300' },
    { label: 'Leave home', time: plan?.departure, dot: 'bg-brand-600', strong: true },
    { label: 'Target arrival', time: plan?.targetArrival, dot: 'bg-accent-500' },
    { label: 'Event starts', time: plan?.eventStart, dot: 'bg-slate-300' },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {!plan ? (
          <p className="rounded-xl bg-canvas p-4 text-sm text-muted">Pick a date and start time to preview your departure.</p>
        ) : (
          <ol className="relative space-y-5 pl-6 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-0.5 before:bg-line">
            {steps.map(({ label, time, dot, strong }) => (
              <li key={label} className="relative flex items-center justify-between gap-3">
                <span className={cn('absolute -left-6 size-4 rounded-full ring-4 ring-surface', dot)} aria-hidden="true" />
                <span className={cn('text-sm', strong ? 'font-bold text-ink' : 'text-muted')}>{label}</span>
                <span className={cn('tabular-nums', strong ? 'text-lg font-extrabold text-brand-700' : 'text-sm font-semibold')}>
                  {formatClock(time)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
