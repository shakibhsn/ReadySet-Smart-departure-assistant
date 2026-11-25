import {
  eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek,
} from 'date-fns'
import { getEventsOnDay } from '@/utils/events'
import { getCategory } from '@/data/categories'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** `compact`: a small calendar for the dashboard (short cells, dots centred). */
export function MonthCalendar({ month, events, selected, onSelect, compact = false }) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  })

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-line pb-2 text-center text-xs font-semibold uppercase tracking-wide text-muted">
        {WEEKDAYS.map((d) => (
          <div key={d}>
            <span className="sm:hidden">{d[0]}</span>
            <span className="hidden sm:inline">{d}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 pt-2">
        {days.map((day) => {
          const dayEvents = getEventsOnDay(events, day)
          const isSelected = isSameDay(day, selected)
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelect(day)}
              aria-label={`${format(day, 'EEEE, MMMM d')}, ${dayEvents.length} events`}
              aria-pressed={isSelected}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-1 rounded-2xl border p-1.5 text-sm transition-colors',
                compact ? 'min-h-12' : 'min-h-14 sm:min-h-20 sm:items-start sm:p-2',
                isSelected ? 'border-brand-600 bg-brand-50' : 'border-transparent hover:bg-canvas',
                !isSameMonth(day, month) && 'text-slate-300',
              )}
            >
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-sm font-semibold',
                  isToday(day) && 'bg-brand-600 text-white',
                  isSelected && !isToday(day) && 'bg-lime text-lime-ink',
                )}
              >
                {format(day, 'd')}
              </span>
              <span className={cn('flex flex-wrap justify-center gap-1', !compact && 'sm:justify-start')}>
                {dayEvents.slice(0, 3).map((e) => (
                  <span key={e.key} className={cn('size-1.5 rounded-full', getCategory(e.category).dot)} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
