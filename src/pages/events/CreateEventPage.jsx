import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/common/PageHeader'
import { EventForm } from '@/components/events/EventForm'
import { emptyEventForm } from '@/components/events/eventFormUtils'
import { useAuth } from '@/hooks/useAuth'
import { useEventMutations } from '@/hooks/useEvents'
import { toDateKey } from '@/utils/format'

export default function CreateEventPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { create } = useEventMutations()
  const pref = user?.preference

  const initial = emptyEventForm({
    timezone: pref?.timezone ?? 'Asia/Dhaka',
    prepMinutes: pref?.defaultPreparationMinutes ?? 30,
    bufferMinutes: pref?.defaultArrivalBufferMinutes ?? 10,
    date: toDateKey(),
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Create event" description="Tell us where and when. We'll work out the rest." />
      <EventForm
        initial={initial}
        submitLabel="Save event"
        onCancel={() => navigate(-1)}
        onSubmit={async (payload) => {
          await create(payload)
          navigate('/schedule', { state: { notice: 'Event created.' } })
        }}
      />
    </div>
  )
}
