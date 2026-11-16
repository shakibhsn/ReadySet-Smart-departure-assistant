import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/common/PageHeader'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { Alert } from '@/components/common/Alert'
import { ButtonLink } from '@/components/ui/button'
import { EventForm } from '@/components/events/EventForm'
import { eventToForm } from '@/components/events/eventFormUtils'
import { useEventQuery } from '@/hooks/useEventQuery'
import { useEventMutations } from '@/hooks/useEvents'
import { getEventById } from '@/services/eventApi'

export default function EditEventPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { update } = useEventMutations()
  const { data: event, error, loading } = useEventQuery(() => getEventById(id), [id])

  if (loading && !event) return <LoadingSkeleton cards={2} />
  if (error) {
    return (
      <div className="space-y-4">
        <Alert>{error.status === 404 ? 'This event was not found.' : error.message}</Alert>
        <ButtonLink to="/schedule" variant="outline">Back to schedule</ButtonLink>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Edit event" description="Changes apply to the whole series for recurring events." />
      {/* key: reset the form when a different event (or a fresher copy after saving) arrives */}
      <EventForm
        key={`${event.id}-${event.updatedAt}`}
        initial={eventToForm(event)}
        submitLabel="Save changes"
        onCancel={() => navigate(-1)}
        onSubmit={async (payload) => {
          await update(id, payload)
          navigate('/schedule', { state: { notice: 'Event updated.' } })
        }}
      />
    </div>
  )
}
