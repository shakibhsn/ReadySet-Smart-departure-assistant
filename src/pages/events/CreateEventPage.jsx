import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/common/PageHeader'
import { useState } from 'react'
import { EventForm } from '@/components/events/EventForm'
import { TemplatePicker } from '@/components/events/TemplatePicker'
import { emptyEventForm, templateToForm } from '@/components/events/eventFormUtils'
import { useAuth } from '@/hooks/useAuth'
import { useEventMutations } from '@/hooks/useEvents'
import { toDateKey } from '@/utils/format'

export default function CreateEventPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { create } = useEventMutations()
  const pref = user?.preference

  const [template, setTemplate] = useState(null)
  const blank = emptyEventForm({
    timezone: pref?.timezone ?? 'Asia/Dhaka',
    prepMinutes: pref?.defaultPreparationMinutes ?? 30,
    bufferMinutes: pref?.defaultArrivalBufferMinutes ?? 10,
    date: toDateKey(),
  })
  const initial = template ? templateToForm(template, blank) : blank

  return (
    <div className="space-y-6">
      <PageHeader title="Create event" description="Tell us where and when. We'll work out the rest." />
      <TemplatePicker value={template?.id ?? null} onChange={setTemplate} />
      <EventForm
        key={template?.id ?? 'blank'}
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
