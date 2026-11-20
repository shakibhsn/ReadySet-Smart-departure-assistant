import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarClock, Compass, Globe, MapPin, Pencil, Repeat, Trash2 } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { CategoryBadge } from '@/components/common/CategoryBadge'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { PageHeader } from '@/components/common/PageHeader'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChecklistPanel } from '@/components/checklist/ChecklistPanel'
import { WeatherCard } from '@/components/weather/WeatherCard'
import { DepartureTimeline } from '@/components/planner/DepartureTimeline'
import { ReadinessPanel } from '@/components/planner/ReadinessPanel'
import { useLiveReadiness } from '@/hooks/useLiveReadiness'
import { getEventDeparturePlan } from '@/services/departureApi'
import { useEventQuery } from '@/hooks/useEventQuery'
import { useEventMutations } from '@/hooks/useEvents'
import { getEventById } from '@/services/eventApi'
import { formatDuration, formatLongDate, formatTime12 } from '@/utils/format'

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function describeRecurrence(r) {
  if (!r) return null
  const every = r.interval === 1 ? '' : `${r.interval} `
  const base =
    r.frequency === 'DAILY'
      ? `Every ${every}${r.interval === 1 ? 'day' : 'days'}`
      : `Every ${every}${r.interval === 1 ? 'week' : 'weeks'} on ${r.daysOfWeek.map((d) => DAY_NAMES[d]).join(', ')}`
  return r.endsOn ? `${base}, until ${formatLongDate(r.endsOn)}` : base
}

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium text-ink sm:text-base">{children}</dd>
      </div>
    </div>
  )
}

export default function EventDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { remove } = useEventMutations()
  const { data: event, error, loading } = useEventQuery(() => getEventById(id), [id])
  // The departure plan is calculated by the backend from this event's saved values (next occurrence if it repeats).
  const planQuery = useEventQuery(() => getEventDeparturePlan(id), [id])
  const { now, live, stale } = useLiveReadiness(planQuery.data, planQuery.reload)
  const [confirming, setConfirming] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  if (loading && !event) return <LoadingSkeleton cards={2} />
  if (error) {
    return (
      <div className="space-y-4">
        <Alert>{error.status === 404 ? 'This event was not found.' : error.message}</Alert>
        <ButtonLink to="/schedule" variant="outline">Back to schedule</ButtonLink>
      </div>
    )
  }

  const handleDelete = async () => {
    try {
      await remove(event.id)
      navigate('/schedule', { replace: true, state: { notice: 'Event deleted.' } })
    } catch (err) {
      setConfirming(false)
      setDeleteError(err.message)
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/schedule" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="size-4" /> Back to schedule
      </Link>
      <PageHeader
        title={event.title}
        description={event.isRecurring ? 'Recurring event' : 'One-time event'}
        actions={
          <>
            <ButtonLink to={`/planner?event=${event.id}`} variant="soft">
              <Compass className="size-4" /> View Departure Plan
            </ButtonLink>
            <ButtonLink to={`/events/${event.id}/edit`} variant="outline">
              <Pencil className="size-4" /> Edit
            </ButtonLink>
            <Button variant="danger" onClick={() => setConfirming(true)}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </>
        }
      />
      {deleteError && <Alert>{deleteError}</Alert>}

      <Card>
        <CardContent className="space-y-6 pt-6 sm:pt-6">
          <CategoryBadge category={event.category} />
          <dl className="grid gap-5 sm:grid-cols-2">
            <Row icon={CalendarClock} label="When">
              {formatLongDate(event.localDate)} at {formatTime12(event.localTime)}
            </Row>
            <Row icon={Globe} label="Timezone">{event.timezone}</Row>
            {event.destination && <Row icon={MapPin} label="Destination">{event.destination}</Row>}
            {event.recurrence && <Row icon={Repeat} label="Repeats">{describeRecurrence(event.recurrence)}</Row>}
          </dl>
          <dl className="grid gap-4 rounded-xl bg-canvas p-4 sm:grid-cols-3">
            <div><dt className="text-xs font-semibold uppercase text-muted">Travel</dt><dd className="font-bold">{formatDuration(event.travelDurationMinutes)}</dd></div>
            <div><dt className="text-xs font-semibold uppercase text-muted">Preparation</dt><dd className="font-bold">{formatDuration(event.preparationMinutes)}</dd></div>
            <div><dt className="text-xs font-semibold uppercase text-muted">Arrival buffer</dt><dd className="font-bold">{formatDuration(event.arrivalBufferMinutes)}</dd></div>
          </dl>
          {event.notes && (
            <div>
              <h2 className="text-sm font-bold">Notes</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{event.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Departure plan</CardTitle>
            <CardDescription>Calculated from this event&apos;s saved travel, preparation and buffer times.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {planQuery.loading && !planQuery.data ? (
            <p role="status" className="text-sm text-muted">Calculating…</p>
          ) : planQuery.error ? (
            <Alert>
              {planQuery.error.message}{' '}
              <button type="button" onClick={planQuery.reload} className="font-bold underline">Try again</button>
            </Alert>
          ) : planQuery.data ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ReadinessPanel view={planQuery.data} live={live} stale={stale} />
              <DepartureTimeline view={planQuery.data} now={now} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <ChecklistPanel event={event} />
        <div className="self-start">
          <WeatherCard event={event} />
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        destructive
        title="Delete this event?"
        description={`"${event.title}"${event.isRecurring ? ' and all of its repeats' : ''} will be permanently removed.`}
        confirmLabel="Delete"
        onCancel={() => setConfirming(false)}
        onConfirm={handleDelete}
      />
    </div>
  )
}
