import { Link } from 'react-router-dom'
import { Clock, MapPin, Pencil, Repeat, Trash2 } from 'lucide-react'
import { CategoryBadge } from '@/components/common/CategoryBadge'
import { PriorityBadge } from '@/components/common/PriorityBadge'
import { getCategory } from '@/data/categories'
import { formatDayLabel, formatDuration, formatTime12 } from '@/utils/format'
import { cn } from '@/lib/utils'

const actionClass =
  'flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-brand-50 hover:text-brand-700'

/** One event (or one occurrence of a recurring event). Edit/delete controls appear when onDelete is given. */
export function EventCard({ event, showDay = false, onDelete, className }) {
  const { dot } = getCategory(event.category)
  const [time, meridiem] = formatTime12(event.startTime).split(' ')
  return (
    <article
      className={cn(
        'card-hover flex gap-4 rounded-xl border border-line bg-surface p-4',
        className,
      )}
    >
      <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-lg bg-canvas py-2 text-center">
        <span className="text-sm font-extrabold leading-tight text-ink">{time}</span>
        <span className="text-[11px] font-semibold uppercase text-muted">{meridiem}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('size-2 rounded-full', dot)} aria-hidden="true" />
          <h3 className="min-w-0 break-words text-sm font-bold text-ink sm:text-base">
            <Link to={`/events/${event.id}`} className="hover:text-brand-700 hover:underline">
              {event.title}
            </Link>
          </h3>
          {event.isRecurring && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted" title="Recurring event">
              <Repeat className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Recurring</span>
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted sm:text-sm">
          {showDay && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" /> {formatDayLabel(event.date)}
            </span>
          )}
          {event.destination && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{event.destination}</span>
            </span>
          )}
          <span>{formatDuration(event.travelMinutes)} travel</span>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={event.category} />
          <PriorityBadge priority={event.priority} />
        </div>
      </div>
      {onDelete && (
        <div className="flex shrink-0 items-start gap-0.5">
          <Link to={`/events/${event.id}/edit`} aria-label={`Edit ${event.title}`} className={actionClass}>
            <Pencil className="size-4" />
          </Link>
          <button
            type="button"
            onClick={() => onDelete(event)}
            aria-label={`Delete ${event.title}`}
            className={cn(actionClass, 'hover:bg-rose-50 hover:text-rose-600')}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
    </article>
  )
}
