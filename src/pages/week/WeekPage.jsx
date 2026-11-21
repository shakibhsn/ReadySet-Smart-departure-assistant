import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Timer } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { CategoryBadge } from '@/components/common/CategoryBadge'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PRIORITY_TONE } from '@/data/categories'
import { useEventQuery } from '@/hooks/useEventQuery'
import { cn } from '@/lib/utils'
import { getWeek } from '@/services/analyticsApi'
import { formatDuration } from '@/utils/format'

const addDays = (dateKey, n) => {
  const d = new Date(`${dateKey}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function WeekEvent({ event }) {
  return (
    <li className={cn('rounded-xl border p-2.5 text-sm', event.hasConflict ? 'border-rose-300 bg-rose-50/60' : 'border-line bg-surface', event.isPast && 'opacity-60')}>
      <Link to={`/events/${event.id}`} className="block min-w-0 font-bold text-ink hover:underline">
        <span className="block truncate">{event.title}</span>
      </Link>
      <p className="mt-0.5 text-xs text-muted">{event.startTime} · leave {event.departureTime}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <CategoryBadge category={event.category} />
        {event.priority !== 'normal' && <Badge className={PRIORITY_TONE[event.priority]}>{event.priority === 'high' ? 'High priority' : 'Low priority'}</Badge>}
        {event.hasConflict && <Badge className="bg-rose-50 text-rose-700 ring-rose-200"><AlertTriangle className="size-3" /> Conflict</Badge>}
      </div>
    </li>
  )
}

export default function WeekPage() {
  const [start, setStart] = useState(undefined) // undefined = the current week
  const query = useEventQuery(() => getWeek(start), [start])
  const week = query.data

  if (query.loading && !week) return <LoadingSkeleton cards={2} />
  if (query.error && !week) return <Alert>{query.error.message} <button type="button" onClick={query.reload} className="font-bold underline">Try again</button></Alert>

  const { summary } = week
  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly Planner"
        description={`${week.weekStart} to ${week.weekEnd} (${week.timezone})`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setStart(addDays(week.weekStart, -7))} aria-label="Previous week"><ChevronLeft className="size-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setStart(undefined)}>This week</Button>
            <Button variant="outline" size="sm" onClick={() => setStart(addDays(week.weekStart, 7))} aria-label="Next week"><ChevronRight className="size-4" /></Button>
          </>
        }
      />

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Events', summary.events],
          ['Preparation workload', formatDuration(summary.workloadMinutes)],
          ['Conflicts', summary.conflicts],
          ['High priority', summary.highPriority],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-surface p-4">
            <dt className="text-xs font-semibold text-muted">{label}</dt>
            <dd className="mt-1 text-2xl font-extrabold text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {summary.events === 0 ? (
        <EmptyState icon={CalendarDays} title="Nothing planned this week" description="Add an event and ReadySet will show when to start preparing and when to leave, day by day." action={<ButtonLink to="/events/new">Add an event</ButtonLink>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7" aria-label="Week overview">
          {week.days.map((d) => (
            <section key={d.date} aria-label={d.label} className={cn('rounded-2xl border p-3', d.isToday ? 'border-brand-400 bg-brand-50/40' : 'border-line bg-surface/60')}>
              <header className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-bold text-ink">{d.label}{d.isToday && <span className="ml-1.5 text-xs font-semibold text-brand-700">Today</span>}</h2>
                {d.workloadMinutes > 0 && <span className="flex items-center gap-1 text-xs text-muted" title="Preparation workload"><Timer className="size-3" />{formatDuration(d.workloadMinutes)}</span>}
              </header>
              {d.events.length === 0 ? <p className="text-xs text-muted">Free day</p> : <ul className="space-y-2">{d.events.map((e) => <WeekEvent key={`${e.id}-${e.startAt}`} event={e} />)}</ul>}
            </section>
          ))}
        </div>
      )}

      {week.upcoming.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Coming up next</CardTitle>
              <CardDescription>The next events in the following two weeks.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">{week.upcoming.map((e) => <WeekEvent key={`${e.id}-${e.startAt}`} event={e} />)}</ul>
          </CardContent>
        </Card>
      )}
      {summary.conflicts > 0 && <p className="text-xs text-muted">{week.conflictAssumptions.join(' ')}</p>}
    </div>
  )
}
