import { useState } from 'react'
import { ListChecks } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { FormSelect } from '@/components/common/FormSelect'
import { EmptyState } from '@/components/common/EmptyState'
import { Alert } from '@/components/common/Alert'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { ChecklistPanel } from '@/components/checklist/ChecklistPanel'
import { WeatherCard } from '@/components/weather/WeatherCard'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useUpcomingEventList } from '@/hooks/useEvents'
import { formatDayLabel, formatTime12 } from '@/utils/format'
import { sortEvents } from '@/utils/events'

function ChecklistBody({ events }) {
  const sorted = sortEvents(events)
  const [eventId, setEventId] = useState(() => sorted[0]?.id ?? '')

  if (events.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Smart Checklist" description="Never leave without what you need." />
        <EmptyState
          icon={ListChecks}
          title="Create an event first"
          description="Checklists belong to events. Add one to get started."
          action={<ButtonLink to="/events/new">Create event</ButtonLink>}
        />
      </div>
    )
  }

  const event = events.find((e) => e.id === eventId) ?? sorted[0]

  return (
    <div className="space-y-6">
      <PageHeader title="Smart Checklist" description="Never leave without what you need." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6 sm:pt-6">
              <FormSelect
                label="Event"
                value={event.id}
                onChange={(e) => setEventId(e.target.value)}
                options={sorted.map((e) => ({ value: e.id, label: `${e.title} · ${formatDayLabel(e.date)}, ${formatTime12(e.startTime)}` }))}
              />
            </CardContent>
          </Card>
          <ChecklistPanel key={event.id} event={event} />
        </div>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <WeatherCard key={event.id} event={event} />
        </div>
      </div>
    </div>
  )
}

export default function ChecklistPage() {
  const { events, data, error, loading, reload } = useUpcomingEventList()
  if (loading && !data) return <LoadingSkeleton cards={2} />
  if (error) {
    return (
      <Alert>
        {error.message}{' '}
        <button type="button" onClick={reload} className="font-bold underline">Try again</button>
      </Alert>
    )
  }
  return <ChecklistBody events={events} />
}
