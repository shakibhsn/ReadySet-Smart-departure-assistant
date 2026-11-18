import { cn } from '@/lib/utils'
import { timelineProgress } from '@/utils/departureStatus'

const STEPS = [
  { key: 'preparationStart', label: 'Preparation starts' },
  { key: 'departureTime', label: 'Leave home' },
  { key: 'targetArrival', label: 'Target arrival' },
  { key: 'eventStart', label: 'Event starts' },
]

/**
 * Vertical timeline of the four milestones, in the event's timezone (from the plan's `local` values).
 * Steps already reached are marked done; the most recent one is highlighted. `now` is optional:
 * without it (a what-if preview) nothing is marked.
 */
export function DepartureTimeline({ view, now }) {
  const progress = now ? timelineProgress(view, now) : null
  const eventDate = view.local.eventStart.date

  return (
    <ol aria-label="Departure timeline" className="relative space-y-5 pl-7 before:absolute before:bottom-2 before:left-[9px] before:top-2 before:w-0.5 before:bg-line">
      {STEPS.map(({ key, label }, i) => {
        const part = view.local[key]
        const step = progress?.[i]
        return (
          <li key={key} className="relative flex items-center justify-between gap-3">
            <span
              aria-hidden="true"
              className={cn(
                'absolute -left-7 size-5 rounded-full ring-4 ring-surface',
                step?.done ? 'bg-accent-500' : key === 'departureTime' ? 'bg-brand-600' : 'bg-slate-300',
                step?.current && 'ring-accent-200',
              )}
            />
            <span className="min-w-0">
              <span className={cn('block text-sm', key === 'departureTime' ? 'font-bold text-ink' : 'text-muted')}>{label}</span>
              {part.date !== eventDate && <span className="block text-xs text-muted">{part.date < eventDate ? 'The day before' : 'The next day'}</span>}
            </span>
            <span className={cn('shrink-0 tabular-nums', key === 'departureTime' ? 'text-lg font-extrabold text-brand-700' : 'text-sm font-semibold')}>
              {part.time12}
              {step?.done && <span className="sr-only"> (reached)</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
