import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarClock, Compass, Flag, RotateCcw, Timer } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { EmptyState } from '@/components/common/EmptyState'
import { FormInput } from '@/components/common/FormInput'
import { FormSelect } from '@/components/common/FormSelect'
import { LoadingSkeleton, Skeleton } from '@/components/common/LoadingSkeleton'
import { PageHeader } from '@/components/common/PageHeader'
import { timezoneOptions } from '@/components/events/eventFormUtils'
import { DepartureTimeline } from '@/components/planner/DepartureTimeline'
import { ReadinessPanel } from '@/components/planner/ReadinessPanel'
import { WeatherCard } from '@/components/weather/WeatherCard'
import { ResultCard } from '@/components/planner/ResultCard'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'
import { useEventQuery } from '@/hooks/useEventQuery'
import { useUpcomingEventList } from '@/hooks/useEvents'
import { useLiveReadiness } from '@/hooks/useLiveReadiness'
import { usePreviewPlan } from '@/hooks/usePreviewPlan'
import { getEventDeparturePlan } from '@/services/departureApi'
import { sortEvents } from '@/utils/events'
import { formatDayLabel, toDateKey } from '@/utils/format'

const CUSTOM = 'custom'
const isMinutes = (v, min) => v !== '' && Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= 1440

function PlannerBody({ events, initialId, initialOccurrence }) {
  const { user } = useAuth()
  const userTimezone = user?.preference?.timezone ?? 'Asia/Dhaka'
  const sorted = sortEvents(events)

  const [selectedId, setSelectedId] = useState(() => (sorted.some((e) => e.id === initialId) ? initialId : (sorted[0]?.id ?? CUSTOM)))
  const [edits, setEdits] = useState({ travel: null, prep: null, buffer: null }) // null = keep the saved value
  const [custom, setCustom] = useState({ date: toDateKey(), time: '10:00', timezone: userTimezone, travel: '35', prep: '30', buffer: '10' })

  const isCustom = selectedId === CUSTOM
  const event = isCustom ? null : sorted.find((e) => e.id === selectedId)
  const occurrence = event?.isRecurring ? (event.id === initialId && initialOccurrence ? initialOccurrence : event.startAt) : undefined

  // Saved plan from the backend, calculated from the stored event values.
  const saved = useEventQuery(() => (event ? getEventDeparturePlan(event.id, occurrence ? { occurrence } : undefined) : Promise.resolve(null)), [selectedId, occurrence])

  const savedValues = event ? { travel: String(event.travelMinutes), prep: String(event.prepMinutes), buffer: String(event.bufferMinutes) } : null
  const values = isCustom
    ? { travel: custom.travel, prep: custom.prep, buffer: custom.buffer }
    : { travel: edits.travel ?? savedValues.travel, prep: edits.prep ?? savedValues.prep, buffer: edits.buffer ?? savedValues.buffer }
  const modified = !isCustom && ['travel', 'prep', 'buffer'].some((k) => values[k] !== savedValues[k])

  const errors = {}
  if (!isMinutes(values.travel, 1)) errors.travel = 'Enter 1–1440 minutes.'
  if (!isMinutes(values.prep, 0)) errors.prep = 'Enter 0–1440 minutes.'
  if (!isMinutes(values.buffer, 0)) errors.buffer = 'Enter 0–1440 minutes.'
  if (isCustom && (!custom.date || !custom.time)) errors.when = 'Pick a date and time.'
  const valid = Object.keys(errors).length === 0

  // What-if preview: only for a custom plan or a saved event whose durations were edited.
  const previewPayload =
    valid && (isCustom || modified)
      ? {
          startAt: isCustom ? `${custom.date}T${custom.time}` : event.startAt,
          timezone: isCustom ? custom.timezone : event.timezone,
          travelDurationMinutes: Number(values.travel),
          preparationMinutes: Number(values.prep),
          arrivalBufferMinutes: Number(values.buffer),
        }
      : null
  const preview = usePreviewPlan(previewPayload)

  const showingPreview = Boolean(previewPayload)
  const active = showingPreview ? preview : saved
  const view = active.data
  const { now, live, stale } = useLiveReadiness(view, showingPreview ? undefined : saved.reload)

  const setValue = (key) => (e) => (isCustom ? setCustom((c) => ({ ...c, [key]: e.target.value })) : setEdits((s) => ({ ...s, [key]: e.target.value })))
  const selectEvent = (id) => {
    setSelectedId(id)
    setEdits({ travel: null, prep: null, buffer: null })
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Departure Planner" description="Work backwards from your event to find the right moment to leave." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-6 self-start">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Plan inputs</CardTitle>
              <CardDescription>Pick a saved event, or enter your own. Changing a duration previews a what-if without touching your event.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormSelect
              className="sm:col-span-2"
              label="Event"
              value={selectedId}
              onChange={(e) => selectEvent(e.target.value)}
              options={[...sorted.map((e) => ({ value: e.id, label: `${e.title} · ${formatDayLabel(e.date)}` })), { value: CUSTOM, label: 'Custom plan' }]}
            />
            {isCustom && (
              <>
                <FormInput label="Event date" type="date" value={custom.date} error={errors.when} onChange={setValue('date')} />
                <FormInput label="Event start time" type="time" value={custom.time} onChange={setValue('time')} />
                <FormSelect className="sm:col-span-2" label="Timezone" options={timezoneOptions(custom.timezone)} value={custom.timezone} onChange={setValue('timezone')} />
              </>
            )}
            <FormInput label="Travel duration" type="number" inputMode="numeric" min="1" suffix="min" value={values.travel} error={errors.travel} onChange={setValue('travel')} />
            <FormInput label="Arrival buffer" type="number" inputMode="numeric" min="0" suffix="min" value={values.buffer} error={errors.buffer} onChange={setValue('buffer')} />
            <FormInput className="sm:col-span-2" label="Preparation time" type="number" inputMode="numeric" min="0" suffix="min" value={values.prep} error={errors.prep} onChange={setValue('prep')} />
            {modified && (
              <Button variant="ghost" size="sm" className="justify-self-start sm:col-span-2" onClick={() => setEdits({ travel: null, prep: null, buffer: null })}>
                <RotateCcw className="size-4" /> Reset to saved values
              </Button>
            )}
          </CardContent>
        </Card>
        {event && <WeatherCard key={event.id} event={event} />}
        </div>

        <div className="space-y-6">
          {active.loading && !view ? (
            <div role="status" aria-label="Calculating departure plan" className="space-y-4">
              <Skeleton className="h-28" />
              <Skeleton className="h-40" />
            </div>
          ) : active.error ? (
            <Alert>
              {active.error.status === 404 ? 'This event was not found.' : active.error.message}{' '}
              {!showingPreview && (
                <button type="button" onClick={saved.reload} className="font-bold underline">
                  Try again
                </button>
              )}
            </Alert>
          ) : !valid ? (
            <EmptyState icon={Compass} title="Check your inputs" description="Fix the highlighted fields to calculate your departure plan." />
          ) : !view ? (
            <EmptyState icon={Compass} title="Choose an event time" description="Select an event or enter a date and start time to see your departure plan." action={<ButtonLink to="/events/new">Create event</ButtonLink>} />
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm text-muted">
                <CalendarClock className="size-4" />
                {view.event.title ?? 'Custom plan'}: starts {formatDayLabel(view.local.eventStart.date)} at {view.local.eventStart.time12} ({view.local.timezone})
              </p>
              <ReadinessPanel view={view} live={live} stale={stale} preview={showingPreview} />
              <div className="grid gap-4 sm:grid-cols-3">
                <ResultCard icon={Flag} label="Target arrival" time={view.local.targetArrival.time12} formula="Event time − arrival buffer" />
                <ResultCard icon={Compass} label="Departure time" time={view.local.departureTime.time12} formula="Target arrival − travel duration" featured />
                <ResultCard icon={Timer} label="Preparation start" time={view.local.preparationStart.time12} formula="Departure time − preparation time" />
              </div>
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Your timeline</CardTitle>
                    <CardDescription>{view.durations.totalRequiredMinutes} minutes needed in total</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <DepartureTimeline view={view} now={showingPreview ? undefined : now} />
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PlannerPage() {
  const [params] = useSearchParams()
  const { events, data, error, loading, reload } = useUpcomingEventList()
  if (loading && !data) return <LoadingSkeleton cards={2} />
  if (error) {
    return (
      <Alert>
        {error.message}{' '}
        <button type="button" onClick={reload} className="font-bold underline">
          Try again
        </button>
      </Alert>
    )
  }
  return <PlannerBody events={events} initialId={params.get('event')} initialOccurrence={params.get('occurrence')} />
}
