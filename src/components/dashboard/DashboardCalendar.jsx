import { useState } from 'react'
import { Link } from 'react-router-dom'
import { addMonths, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MonthCalendar } from '@/components/events/MonthCalendar'
import { ScheduleList } from '@/components/events/ScheduleList'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useEventQuery } from '@/hooks/useEventQuery'
import { getOccurrences } from '@/services/eventApi'
import { getEventsOnDay } from '@/utils/events'

const key = (d) => format(d, 'yyyy-MM-dd')

/** A compact month calendar of the user's real events (recurring events expanded) with the selected day listed underneath. */
export function DashboardCalendar() {
  const [month, setMonth] = useState(() => new Date())
  const [selected, setSelected] = useState(() => new Date())
  const from = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const to = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const query = useEventQuery(() => getOccurrences({ from: key(from), to: key(to) }), [key(from), key(to)])
  const events = query.data ?? []
  const dayEvents = getEventsOnDay(events, selected)

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Calendar</CardTitle>
          <CardDescription>{format(month, 'MMMM yyyy')}</CardDescription>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" aria-label="Previous month" onClick={() => setMonth((m) => subMonths(m, 1))}><ChevronLeft className="size-4" /></Button>
          <Button variant="ghost" size="sm" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}><ChevronRight className="size-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.error ? (
          <p className="text-sm text-muted">The calendar could not be loaded. <button type="button" onClick={query.reload} className="font-bold text-brand-700 underline">Try again</button></p>
        ) : (
          <MonthCalendar compact month={month} events={events} selected={selected} onSelect={setSelected} />
        )}
        <section aria-label={`Events on ${format(selected, 'EEEE, MMMM d')}`}>
          <h3 className="mb-2 text-sm font-bold text-ink">{format(selected, 'EEEE, MMMM d')}</h3>
          {dayEvents.length === 0 ? (
            <p className="text-sm text-muted">Nothing scheduled this day. <Link to="/events/new" className="font-semibold text-brand-700 hover:underline">Add an event</Link></p>
          ) : (
            <ScheduleList events={dayEvents} />
          )}
        </section>
      </CardContent>
    </Card>
  )
}
