import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { FormInput } from '@/components/common/FormInput'
import { FormSelect } from '@/components/common/FormSelect'
import { FormTextarea } from '@/components/common/FormTextarea'
import { DeparturePreview } from '@/components/planner/DeparturePreview'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAppState } from '@/hooks/useAppState'
import { useAuth } from '@/hooks/useAuth'
import { EVENT_CATEGORIES } from '@/data/categories'
import { toDateKey } from '@/utils/format'
import { calculateDeparture, parseDateTime } from '@/utils/departure'

function validate(form) {
  const errors = {}
  if (form.title.trim().length < 2) errors.title = 'Give your event a title.'
  if (!form.category) errors.category = 'Choose a category.'
  if (!form.date) errors.date = 'Pick a date.'
  if (!form.startTime) errors.startTime = 'Pick a start time.'
  if (!form.destination.trim()) errors.destination = 'Where are you going?'
  const num = (v) => (v === '' ? NaN : Number(v))
  if (!(num(form.travelMinutes) >= 1 && num(form.travelMinutes) <= 600)) errors.travelMinutes = 'Enter 1–600 minutes.'
  if (!(num(form.prepMinutes) >= 0 && num(form.prepMinutes) <= 600)) errors.prepMinutes = 'Enter 0–600 minutes.'
  if (!(num(form.bufferMinutes) >= 0 && num(form.bufferMinutes) <= 240)) errors.bufferMinutes = 'Enter 0–240 minutes.'
  return errors
}

export default function CreateEventPage() {
  const navigate = useNavigate()
  const { addEvent } = useAppState()
  const { user } = useAuth()
  const [form, setForm] = useState({
    title: '',
    category: '',
    date: toDateKey(),
    startTime: '',
    destination: '',
    travelMinutes: '',
    prepMinutes: String(user?.preference?.defaultPreparationMinutes ?? 30),
    bufferMinutes: String(user?.preference?.defaultArrivalBufferMinutes ?? 10),
    notes: '',
  })
  const [errors, setErrors] = useState({})

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      document.getElementById('event-form')?.querySelector('[aria-invalid="true"]')?.focus()
      return
    }
    // Day 1: stored in temporary frontend state only (no backend).
    addEvent({
      ...form,
      title: form.title.trim(),
      destination: form.destination.trim(),
      notes: form.notes.trim(),
      travelMinutes: Number(form.travelMinutes),
      prepMinutes: Number(form.prepMinutes),
      bufferMinutes: Number(form.bufferMinutes),
    })
    navigate('/schedule')
  }

  const plan = calculateDeparture(parseDateTime(form.date, form.startTime), {
    travelMinutes: form.travelMinutes,
    bufferMinutes: form.bufferMinutes,
    prepMinutes: form.prepMinutes,
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Create event" description="Tell us where and when. We'll work out the rest." />

      <form id="event-form" onSubmit={handleSubmit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardContent className="grid gap-5 pt-6 sm:grid-cols-2 sm:pt-6">
            <FormInput className="sm:col-span-2" label="Event title" required placeholder="e.g. Database Systems Class" value={form.title} error={errors.title} onChange={set('title')} />
            <FormSelect label="Category" required placeholder="Select a category" options={EVENT_CATEGORIES} value={form.category} error={errors.category} onChange={set('category')} />
            <FormInput label="Destination" required icon={MapPin} placeholder="Building, address or place" value={form.destination} error={errors.destination} onChange={set('destination')} />
            <FormInput label="Event date" type="date" required value={form.date} error={errors.date} onChange={set('date')} />
            <FormInput label="Start time" type="time" required value={form.startTime} error={errors.startTime} onChange={set('startTime')} />
            <FormInput label="Travel duration" type="number" inputMode="numeric" min="1" required suffix="min" placeholder="35" value={form.travelMinutes} error={errors.travelMinutes} onChange={set('travelMinutes')} />
            <FormInput label="Preparation time" type="number" inputMode="numeric" min="0" required suffix="min" value={form.prepMinutes} error={errors.prepMinutes} hint="Time you need to get ready." onChange={set('prepMinutes')} />
            <FormInput label="Arrival buffer" type="number" inputMode="numeric" min="0" required suffix="min" value={form.bufferMinutes} error={errors.bufferMinutes} hint="How early you want to arrive." onChange={set('bufferMinutes')} />
            <FormTextarea className="sm:col-span-2" label="Additional notes" placeholder="Anything to remember?" value={form.notes} onChange={set('notes')} />

            <div className="flex flex-col-reverse gap-3 sm:col-span-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button type="submit">Save event</Button>
            </div>
          </CardContent>
        </Card>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <DeparturePreview plan={plan} title="Live preview" />
        </div>
      </form>
    </div>
  )
}
