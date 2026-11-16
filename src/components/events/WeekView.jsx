import { eachDayOfInterval, endOfWeek, format, isToday, startOfWeek } from 'date-fns'
import { EventCard } from './EventCard'
import { getEventsOnDay } from '@/utils/events'
import { cn } from '@/lib/utils'

export function WeekView({ date, events, onDelete }) {
  const days = eachDayOfInterval({
    start: startOfWeek(date, { weekStartsOn: 1 }),
    end: endOfWeek(date, { weekStartsOn: 1 }),
  })

  return (
    <div className="space-y-4">
      {days.map((day) => {
        const dayEvents = getEventsOnDay(events, day)
        return (
          <section key={day.toISOString()} className="grid gap-3 sm:grid-cols-[7rem_1fr]">
            <h3 className={cn('text-sm font-bold', isToday(day) ? 'text-brand-600' : 'text-ink')}>
              {format(day, 'EEE, MMM d')}
              {isToday(day) && <span className="ml-2 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Today</span>}
            </h3>
            {dayEvents.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">No events</p>
            ) : (
              <ul className="space-y-2">
                {dayEvents.map((e) => (
                  <li key={e.key}>
                    <EventCard event={e} onDelete={onDelete} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
