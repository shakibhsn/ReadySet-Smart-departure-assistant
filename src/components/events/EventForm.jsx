import { useMemo, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { FormInput } from '@/components/common/FormInput'
import { FormSelect } from '@/components/common/FormSelect'
import { FormTextarea } from '@/components/common/FormTextarea'
import { PrepHint } from '@/components/events/PrepHint'
import { PlacePicker } from '@/components/events/PlacePicker'
import { DeparturePreview } from '@/components/planner/DeparturePreview'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EVENT_CATEGORIES, EVENT_PRIORITY_OPTIONS } from '@/data/categories'
import { ApiError, fieldErrorsFrom } from '@/lib/apiClient'
import { usePreviewPlan } from '@/hooks/usePreviewPlan'
import { END_MODES, FREQUENCIES, FREQUENCY_UNITS, SERVER_FIELD, WEEKDAYS, formToPayload, timezoneOptions, validateEventForm } from './eventFormUtils'
import { cn } from '@/lib/utils'

/**
 * Create / edit form. `onSubmit(payload)` must return a promise; API errors are shown here.
 * Double submissions are blocked while a request is in flight.
 */
export function EventForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)
  // ~430 zone names: build the option list once, not on every keystroke.
  const zoneOptions = useMemo(() => timezoneOptions(initial.timezone), [initial.timezone])

  const set = (key) => (e) => {
    const value = e.target.value
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const toggleWeekday = (day) => {
    setForm((f) => ({ ...f, weekdays: f.weekdays.includes(day) ? f.weekdays.filter((d) => d !== day) : [...f.weekdays, day] }))
    setErrors((prev) => ({ ...prev, weekdays: undefined }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (inFlight.current) return
    const found = validateEventForm(form)
    setErrors(found)
    setFormError('')
    if (Object.keys(found).length > 0) {
      document.getElementById('event-form')?.querySelector('[aria-invalid="true"]')?.focus()
      return
    }

    inFlight.current = true
    setSubmitting(true)
    try {
      await onSubmit(formToPayload(form))
    } catch (err) {
      if (err instanceof ApiError) {
        const mapped = {}
        for (const [field, message] of Object.entries(fieldErrorsFrom(err))) mapped[SERVER_FIELD[field] ?? field] = message
        setErrors(mapped)
        setFormError(err.status === 400 ? 'Please fix the highlighted fields.' : err.message)
      } else {
        setFormError('Something went wrong. Please try again.')
      }
      inFlight.current = false
      setSubmitting(false)
    }
  }

  // Live preview comes from the backend calculator (the single source of truth), so it can never
  // disagree with the saved plan or the reminder emails. Debounced, and only sent for valid input.
  const liveErrors = validateEventForm(form)
  const previewReady = form.date && form.startTime && !liveErrors.travelMinutes && !liveErrors.prepMinutes && !liveErrors.bufferMinutes
  const preview = usePreviewPlan(
    previewReady
      ? {
          startAt: `${form.date}T${form.startTime}`,
          timezone: form.timezone,
          travelDurationMinutes: Number(form.travelMinutes),
          preparationMinutes: Number(form.prepMinutes),
          arrivalBufferMinutes: Number(form.bufferMinutes),
        }
      : null,
  )

  return (
    <form id="event-form" onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card>
        <CardContent className="grid gap-5 pt-6 sm:grid-cols-2 sm:pt-6">
          {formError && <Alert className="sm:col-span-2">{formError}</Alert>}
          <h3 className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700 sm:col-span-2"><span>Event</span><span aria-hidden="true" className="h-px flex-1 bg-line" /></h3>
          <FormInput className="sm:col-span-2" label="Event title" required placeholder="e.g. Database Systems Class" value={form.title} error={errors.title} onChange={set('title')} />
          <FormSelect label="Priority" options={EVENT_PRIORITY_OPTIONS} value={form.priority ?? 'normal'} onChange={set('priority')} hint="Shown in your weekly planner. It does not change reminders or times." />
          <FormSelect label="Category" required placeholder="Select a category" options={EVENT_CATEGORIES} value={form.category} error={errors.category} onChange={set('category')} />
          <FormInput label="Destination" icon={MapPin} placeholder="Building, address or place" value={form.destination} error={errors.destination} onChange={set('destination')} />
          <PlacePicker onPick={(address) => setForm((f) => ({ ...f, destination: address }))} />
          <h3 className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700 sm:col-span-2"><span>When</span><span aria-hidden="true" className="h-px flex-1 bg-line" /></h3>
          <FormInput label="Event date" type="date" required value={form.date} error={errors.date} onChange={set('date')} />
          <FormInput label="Start time" type="time" required value={form.startTime} error={errors.startTime} onChange={set('startTime')} />
          <FormSelect className="sm:col-span-2" label="Timezone" options={zoneOptions} value={form.timezone} error={errors.timezone} hint="The date and time above are in this timezone." onChange={set('timezone')} />
          <h3 className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700 sm:col-span-2"><span>Getting ready and getting there</span><span aria-hidden="true" className="h-px flex-1 bg-line" /></h3>
          <FormInput label="Travel duration" type="number" inputMode="numeric" min="1" required suffix="min" placeholder="35" value={form.travelMinutes} error={errors.travelMinutes} onChange={set('travelMinutes')} />
          <FormInput label="Preparation time" type="number" inputMode="numeric" min="0" required suffix="min" value={form.prepMinutes} error={errors.prepMinutes} hint="Time you need to get ready." onChange={set('prepMinutes')} />
          <FormInput label="Arrival buffer" type="number" inputMode="numeric" min="0" required suffix="min" value={form.bufferMinutes} error={errors.bufferMinutes} hint="How early you want to arrive." onChange={set('bufferMinutes')} />
          <PrepHint category={form.category} onUsePrep={(m) => setForm((f) => ({ ...f, prepMinutes: String(m) }))} onUseBuffer={(m) => setForm((f) => ({ ...f, bufferMinutes: String(m) }))} />
          <FormInput label="Duration (optional)" type="number" inputMode="numeric" min="1" suffix="min" placeholder="60" value={form.durationMinutes} error={errors.durationMinutes} hint="Used to spot schedule conflicts. Blank is treated as 60 minutes." onChange={set('durationMinutes')} />
          <FormTextarea className="sm:col-span-2" label="Additional notes" placeholder="Anything to remember?" value={form.notes} error={errors.notes} onChange={set('notes')} />

          <fieldset className="space-y-4 rounded-xl border border-line p-4 sm:col-span-2">
            <legend className="px-1 text-sm font-semibold">Recurrence</legend>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                className="size-5 cursor-pointer accent-brand-600"
                checked={form.recurring}
                onChange={(e) => setForm((f) => ({ ...f, recurring: e.target.checked }))}
              />
              Repeat this event
            </label>
            {form.recurring && (
              <div className="grid gap-4 sm:grid-cols-3">
                <FormSelect label="Repeats" options={FREQUENCIES} value={form.frequency} error={errors.frequency} onChange={set('frequency')} />
                <FormInput label="Every" type="number" inputMode="numeric" min="1" suffix={FREQUENCY_UNITS[form.frequency]} value={form.interval} error={errors.interval} onChange={set('interval')} />
                <FormSelect label="Ends" options={END_MODES} value={form.endMode} onChange={set('endMode')} />
                {form.endMode === 'date' && <FormInput className="sm:col-span-3" label="Ends on" type="date" value={form.endsOn} error={errors.endsOn} onChange={set('endsOn')} />}
                {form.endMode === 'count' && <FormInput className="sm:col-span-3" label="Number of occurrences" type="number" inputMode="numeric" min="1" max="365" suffix="times" value={form.count} error={errors.count} hint="The event stops repeating after this many times." onChange={set('count')} />}
                {form.frequency === 'MONTHLY' && <p className="text-xs text-muted sm:col-span-3">Repeats on the same day of the month. For the 29th–31st, shorter months use their last day.</p>}
                {form.frequency === 'WEEKLY' && (
                  <div className="sm:col-span-3">
                    <p id="weekday-label" className="mb-2 text-sm font-semibold">On these days</p>
                    <div role="group" aria-labelledby="weekday-label" className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((d) => (
                        <button
                          key={d.value}
                          type="button"
                          aria-pressed={form.weekdays.includes(d.value)}
                          onClick={() => toggleWeekday(d.value)}
                          className={cn(
                            'h-10 min-w-12 cursor-pointer rounded-lg border px-3 text-sm font-semibold transition-colors',
                            form.weekdays.includes(d.value) ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-surface text-muted hover:border-brand-200',
                          )}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                    {errors.weekdays && <p role="alert" className="mt-1.5 text-xs font-medium text-rose-600">{errors.weekdays}</p>}
                  </div>
                )}
              </div>
            )}
          </fieldset>

          <div className="flex flex-col-reverse gap-3 sm:col-span-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : submitLabel}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <DeparturePreview view={preview.data} loading={preview.loading} error={preview.error} title="Live preview" />
      </div>
    </form>
  )
}
