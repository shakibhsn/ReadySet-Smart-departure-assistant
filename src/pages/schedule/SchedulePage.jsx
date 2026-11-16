import { useState } from 'react'
import { addMonths, addWeeks, endOfWeek, format, isSameDay, startOfWeek, subMonths, subWeeks } from 'date-fns'
import { CalendarPlus, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { SegmentedControl } from '@/components/common/SegmentedControl'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { MonthCalendar } from '@/components/events/MonthCalendar'
import { WeekView } from '@/components/events/WeekView'
import { ScheduleList } from '@/components/events/ScheduleList'
import { useAppState } from '@/hooks/useAppState'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { getEventsOnDay, sortEvents } from '@/utils/events'
import { parseDateTime } from '@/utils/departure'

const VIEWS = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'list', label: 'List' },
]

export default function SchedulePage() {
  const { events } = useAppState()
  const loading = useSimulatedLoading(400)
  const [view, setView] = useState('month')
  const [cursor, setCursor] = useState(() => new Date())
  const [selected, setSelected] = useState(() => new Date())

  if (loading) return <LoadingSkeleton cards={2} />

  const step = (dir) => {
    if (view === 'week') setCursor(dir > 0 ? addWeeks(cursor, 1) : subWeeks(cursor, 1))
    else setCursor(dir > 0 ? addMonths(cursor, 1) : subMonths(cursor, 1))
  }

  const rangeLabel =
    view === 'week'
      ? `${format(startOfWeek(cursor, { weekStartsOn: 1 }), 'MMM d')} – ${format(endOfWeek(cursor, { weekStartsOn: 1 }), 'MMM d, yyyy')}`
      : format(cursor, 'MMMM yyyy')

  const now = new Date()
  const upcoming = sortEvents(events).filter((e) => (parseDateTime(e.date, e.startTime) ?? 0) >= now)
  const selectedEvents = getEventsOnDay(events, selected)

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Schedule"
        description="Everything coming up, in one place."
        actions={
          <>
            <SegmentedControl label="Schedule view" options={VIEWS} value={view} onChange={setView} />
            <ButtonLink to="/events/new">
              <Plus className="size-4" /> Create event
            </ButtonLink>
          </>
        }
      />

      {events.length === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          title="Your schedule is empty"
          description="Add your first event and ReadySet will tell you when to leave."
          action={<ButtonLink to="/events/new">Create your first event</ButtonLink>}
        />
      ) : view === 'list' ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Upcoming events</CardTitle>
              <CardDescription>{upcoming.length} scheduled</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ScheduleList events={upcoming} showDay emptyTitle="No upcoming events" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader className="items-center">
              <CardTitle className="text-lg">{rangeLabel}</CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
                  Today
                </Button>
                <Button variant="ghost" size="icon" className="size-9" onClick={() => step(-1)} aria-label="Previous">
                  <ChevronLeft className="size-5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-9" onClick={() => step(1)} aria-label="Next">
                  <ChevronRight className="size-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {view === 'month' ? (
                <MonthCalendar month={cursor} events={events} selected={selected} onSelect={setSelected} />
              ) : (
                <WeekView date={cursor} events={events} />
              )}
            </CardContent>
          </Card>

          {view === 'month' && (
            <Card className="self-start">
              <CardHeader>
                <div>
                  <CardTitle>{isSameDay(selected, now) ? 'Today' : format(selected, 'EEEE, MMM d')}</CardTitle>
                  <CardDescription>
                    {selectedEvents.length} {selectedEvents.length === 1 ? 'event' : 'events'}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <ScheduleList events={selectedEvents} emptyTitle="Nothing on this day" />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
