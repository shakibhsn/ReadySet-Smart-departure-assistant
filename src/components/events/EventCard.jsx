import { Clock, MapPin } from 'lucide-react'
import { CategoryBadge } from '@/components/common/CategoryBadge'
import { getCategory } from '@/data/categories'
import { formatDayLabel, formatDuration, formatTime12 } from '@/utils/format'
import { cn } from '@/lib/utils'

export function EventCard({ event, showDay = false, className }) {
  const { dot } = getCategory(event.category)
  return (
    <article
      className={cn(
        'flex gap-4 rounded-xl border border-line bg-surface p-4 transition-shadow hover:shadow-lift',
        className,
      )}
    >
      <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-lg bg-canvas py-2 text-center">
        <span className="text-sm font-extrabold leading-tight text-ink">{formatTime12(event.startTime).split(' ')[0]}</span>
        <span className="text-[11px] font-semibold uppercase text-muted">{formatTime12(event.startTime).split(' ')[1]}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('size-2 rounded-full', dot)} aria-hidden="true" />
          <h3 className="truncate text-sm font-bold text-ink sm:text-base">{event.title}</h3>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted sm:text-sm">
          {showDay && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" /> {formatDayLabel(event.date)}
            </span>
          )}
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{event.destination}</span>
          </span>
          <span>{formatDuration(event.travelMinutes)} travel</span>
        </div>
        <div className="mt-2.5">
          <CategoryBadge category={event.category} />
        </div>
      </div>
    </article>
  )
}
