import { useState } from 'react'
import { CalendarClock, Compass, Flag, Timer } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { FormInput } from '@/components/common/FormInput'
import { FormSelect } from '@/components/common/FormSelect'
import { EmptyState } from '@/components/common/EmptyState'
import { DeparturePreview } from '@/components/planner/DeparturePreview'
import { ResultCard } from '@/components/planner/ResultCard'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppState } from '@/hooks/useAppState'
import { calculateDeparture, formatClock, parseDateTime } from '@/utils/departure'
import { getNextEvent, sortEvents } from '@/utils/events'
import { formatDayLabel, formatTime12 } from '@/utils/format'

const CUSTOM = 'custom'

export default function PlannerPage() {
  const { events } = useAppState()
  const sorted = sortEvents(events)
  const initial = getNextEvent(events) ?? sorted[0]

  const [selectedId, setSelectedId] = useState(initial?.id ?? CUSTOM)
  const [inputs, setInputs] = useState({
    date: initial?.date ?? '',
    startTime: initial?.startTime ?? '',
    travelMinutes: String(initial?.travelMinutes ?? 30),
    bufferMinutes: String(initial?.bufferMinutes ?? 10),
    prepMinutes: String(initial?.prepMinutes ?? 30),
  })

  const selectEvent = (id) => {
    setSelectedId(id)
    const e = events.find((ev) => ev.id === id)
    if (e) {
      setInputs({
        date: e.date,
        startTime: e.startTime,
        travelMinutes: String(e.travelMinutes),
        bufferMinutes: String(e.bufferMinutes),
        prepMinutes: String(e.prepMinutes),
      })
    }
  }

  const set = (key) => (e) => setInputs((prev) => ({ ...prev, [key]: e.target.value }))

  // Recomputed on every render, so any input change updates the results instantly.
  const plan = calculateDeparture(parseDateTime(inputs.date, inputs.startTime), inputs)

  const invalid = (v, min) => (v === '' || Number(v) < min ? `Minimum ${min}.` : undefined)

  return (
    <div className="space-y-6">
      <PageHeader title="Departure Planner" description="Work backwards from your event to find the right moment to leave." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="self-start">
          <CardHeader>
            <div>
              <CardTitle>Plan inputs</CardTitle>
              <CardDescription>Pick an event, or enter your own numbers.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormSelect
              className="sm:col-span-2"
              label="Event"
              value={selectedId}
              onChange={(e) => selectEvent(e.target.value)}
              options={[
                ...sorted.map((e) => ({ value: e.id, label: `${e.title} · ${formatDayLabel(e.date)}` })),
                { value: CUSTOM, label: 'Custom plan' },
              ]}
            />
            <FormInput label="Event date" type="date" value={inputs.date} onChange={set('date')} />
            <FormInput label="Event start time" type="time" value={inputs.startTime} onChange={set('startTime')} />
            <FormInput label="Travel duration" type="number" inputMode="numeric" min="0" suffix="min" value={inputs.travelMinutes} error={invalid(inputs.travelMinutes, 0)} onChange={set('travelMinutes')} />
            <FormInput label="Arrival buffer" type="number" inputMode="numeric" min="0" suffix="min" value={inputs.bufferMinutes} error={invalid(inputs.bufferMinutes, 0)} onChange={set('bufferMinutes')} />
            <FormInput className="sm:col-span-2" label="Preparation time" type="number" inputMode="numeric" min="0" suffix="min" value={inputs.prepMinutes} error={invalid(inputs.prepMinutes, 0)} onChange={set('prepMinutes')} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          {!plan ? (
            <EmptyState
              icon={Compass}
              title="Choose an event time"
              description="Select an event or enter a date and start time to see your departure plan."
              action={events.length === 0 && <ButtonLink to="/events/new">Create event</ButtonLink>}
            />
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm text-muted">
                <CalendarClock className="size-4" />
                Event starts {formatDayLabel(inputs.date)} at {formatTime12(inputs.startTime)}
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <ResultCard icon={Flag} label="Target arrival" time={formatClock(plan.targetArrival)} formula="Event time − arrival buffer" />
                <ResultCard icon={Compass} label="Departure time" time={formatClock(plan.departure)} formula="Target arrival − travel duration" featured />
                <ResultCard icon={Timer} label="Preparation start" time={formatClock(plan.prepStart)} formula="Departure time − preparation time" />
              </div>
              <DeparturePreview plan={plan} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
