import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameDay, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns'
import { CalendarPlus, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { FormInput } from '@/components/common/FormInput'
import { FormSelect } from '@/components/common/FormSelect'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { PageHeader } from '@/components/common/PageHeader'
import { SegmentedControl } from '@/components/common/SegmentedControl'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MonthCalendar } from '@/components/events/MonthCalendar'
import { ScheduleList } from '@/components/events/ScheduleList'
import { WeekView } from '@/components/events/WeekView'
import { EVENT_CATEGORIES } from '@/data/categories'
import { useEventQuery } from '@/hooks/useEventQuery'
import { useEventMutations } from '@/hooks/useEvents'
import { getEvents, getOccurrences } from '@/services/eventApi'
import { getEventsOnDay } from '@/utils/events'

const VIEWS = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'list', label: 'List' },
]
const PAGE_SIZE = 10
const dayKey = (d) => format(d, 'yyyy-MM-dd')

export default function SchedulePage() {
  const location = useLocation()
  const { remove } = useEventMutations()
  const [view, setView] = useState('month')
  const [cursor, setCursor] = useState(() => new Date())
  const [selected, setSelected] = useState(() => new Date())
  const [category, setCategory] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState(location.state?.notice ?? '')
  const [toDelete, setToDelete] = useState(null)
  const [deleteError, setDeleteError] = useState('')

  // Calendar views fetch every occurrence (recurring events expanded) in the visible range.
  const rangeStart = view === 'week' ? startOfWeek(cursor, { weekStartsOn: 1 }) : startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
  const rangeEnd = view === 'week' ? endOfWeek(cursor, { weekStartsOn: 1 }) : endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
  const calendar = useEventQuery(
    () => (view === 'list' ? Promise.resolve(null) : getOccurrences({ from: dayKey(rangeStart), to: dayKey(rangeEnd), category })),
    [view, dayKey(rangeStart), dayKey(rangeEnd), category],
  )
  // List view uses the paginated events endpoint (one row per event / series).
  const list = useEventQuery(
    () => (view !== 'list' ? Promise.resolve(null) : getEvents({ page, limit: PAGE_SIZE, category, from, to })),
    [view, page, category, from, to],
  )

  const active = view === 'list' ? list : calendar
  const step = (dir) => setCursor(view === 'week' ? (dir > 0 ? addWeeks(cursor, 1) : subWeeks(cursor, 1)) : dir > 0 ? addMonths(cursor, 1) : subMonths(cursor, 1))
  const rangeLabel = view === 'week' ? `${format(rangeStart, 'MMM d')} – ${format(rangeEnd, 'MMM d, yyyy')}` : format(cursor, 'MMMM yyyy')

  const handleDelete = async () => {
    const event = toDelete
    setToDelete(null)
    try {
      await remove(event.id)
      setDeleteError('')
      setNotice('Event deleted.')
      if (view === 'list' && page > 1 && list.data?.events.length === 1) setPage(page - 1)
    } catch (err) {
      setNotice('')
      setDeleteError(err.message)
    }
  }

  const filtersActive = Boolean(category || from || to)
  const items = calendar.data ?? []
  const selectedEvents = getEventsOnDay(items, selected)
  const pagination = list.data?.pagination

  let body
  if (active.loading && !active.data) {
    body = <LoadingSkeleton cards={2} />
  } else if (active.error) {
    body = (
      <Alert>
        {active.error.message}{' '}
        <button type="button" onClick={active.reload} className="font-bold underline">Try again</button>
      </Alert>
    )
  } else if (view === 'list') {
    const events = list.data?.events ?? []
    body = (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Events</CardTitle>
            <CardDescription>{pagination?.total ?? 0} {pagination?.total === 1 ? 'event' : 'events'}{filtersActive ? ' match your filters' : ''}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {events.length === 0 && !filtersActive ? (
            <EmptyState
              icon={CalendarPlus}
              title="Your schedule is empty"
              description="Add your first event and ReadySet will tell you when to leave."
              action={<ButtonLink to="/events/new">Create your first event</ButtonLink>}
            />
          ) : (
            <ScheduleList events={events} showDay onDelete={setToDelete} emptyTitle="No events match" emptyDescription="Try a different category or date range." />
          )}
          {pagination && pagination.totalPages > 1 && (
            <nav aria-label="Pagination" className="mt-5 flex items-center justify-between gap-3">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="text-sm text-muted">Page {pagination.page} of {pagination.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </nav>
          )}
        </CardContent>
      </Card>
    )
  } else {
    body = (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="items-center">
            <CardTitle className="text-lg">{rangeLabel}</CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
              <Button variant="ghost" size="icon" className="size-9" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft className="size-5" /></Button>
              <Button variant="ghost" size="icon" className="size-9" onClick={() => step(1)} aria-label="Next"><ChevronRight className="size-5" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            {view === 'month' ? (
              <MonthCalendar month={cursor} events={items} selected={selected} onSelect={setSelected} />
            ) : (
              <WeekView date={cursor} events={items} onDelete={setToDelete} />
            )}
          </CardContent>
        </Card>

        {view === 'month' && (
          <Card className="self-start">
            <CardHeader>
              <div>
                <CardTitle>{isSameDay(selected, new Date()) ? 'Today' : format(selected, 'EEEE, MMM d')}</CardTitle>
                <CardDescription>{selectedEvents.length} {selectedEvents.length === 1 ? 'event' : 'events'}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ScheduleList events={selectedEvents} onDelete={setToDelete} emptyTitle="Nothing on this day" />
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

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

      {notice && <Alert variant="success">{notice}</Alert>}
      {deleteError && <Alert>{deleteError}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[14rem_1fr] lg:items-end">
        <FormSelect
          label="Category"
          placeholder="All categories"
          options={EVENT_CATEGORIES}
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1) }}
        />
        {view === 'list' && (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <FormInput label="From" type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1) }} />
            <FormInput label="To" type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1) }} />
            {filtersActive && (
              <Button variant="ghost" onClick={() => { setCategory(''); setFrom(''); setTo(''); setPage(1) }}>Clear filters</Button>
            )}
          </div>
        )}
      </div>

      {body}

      <ConfirmDialog
        open={Boolean(toDelete)}
        destructive
        title="Delete this event?"
        description={toDelete ? `"${toDelete.title}"${toDelete.isRecurring ? ' and all of its repeats' : ''} will be permanently removed.` : ''}
        confirmLabel="Delete"
        onCancel={() => setToDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}
