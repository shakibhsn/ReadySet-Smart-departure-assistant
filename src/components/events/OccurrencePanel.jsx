import { useState } from 'react'
import { Pencil, RotateCcw, SkipForward } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { FormInput } from '@/components/common/FormInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useEventsCache } from '@/hooks/useEventQuery'
import { overrideOccurrence, restoreOccurrence, skipOccurrence } from '@/services/scheduleApi'
import { formatDayLabel } from '@/utils/format'

const minutes = (v, min) => v !== '' && Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= 1440

/** Skip / edit / restore the occurrence the departure plan is currently showing (the next one). */
export function OccurrencePanel({ event, plan, onChanged }) {
  const { invalidate } = useEventsCache()
  const [confirmSkip, setConfirmSkip] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  if (!plan) return null
  const originalStart = plan.event.originalStart ?? plan.event.startAt
  const modified = Boolean(plan.event.isModified)

  const run = async (fn, message) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      invalidate()
      onChanged?.()
      setNotice(message)
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-wrap items-center">
        <div>
          <CardTitle>This occurrence</CardTitle>
          <CardDescription>
            {formatDayLabel(plan.local.eventStart.date)} at {plan.local.eventStart.time12}
          </CardDescription>
        </div>
        {modified && <Badge className="bg-amber-50 text-amber-700 ring-amber-200">Changed</Badge>}
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {notice && <Alert variant="success">{notice}</Alert>}
        <p className="text-sm text-muted">Change just this date without touching the rest of the series. To change every occurrence, use Edit.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => { setNotice(''); setEditing(true) }} disabled={busy}>
            <Pencil className="size-4" /> Edit this occurrence
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setNotice(''); setConfirmSkip(true) }} disabled={busy}>
            <SkipForward className="size-4" /> Skip this occurrence
          </Button>
          {modified && (
            <Button variant="ghost" size="sm" onClick={() => run(() => restoreOccurrence(event.id, originalStart), 'This occurrence is back to the series settings.')} disabled={busy}>
              <RotateCcw className="size-4" /> Restore original
            </Button>
          )}
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmSkip}
        title="Skip this occurrence?"
        description={`${formatDayLabel(plan.local.eventStart.date)} at ${plan.local.eventStart.time12} will be skipped. The rest of the series is not affected, and you can restore it later.`}
        confirmLabel="Skip it"
        onCancel={() => setConfirmSkip(false)}
        onConfirm={async () => {
          setConfirmSkip(false)
          await run(() => skipOccurrence(event.id, originalStart), 'Occurrence skipped. The next one is shown below.')
        }}
      />
      {editing && (
        <EditOccurrenceDialog
          plan={plan}
          onCancel={() => setEditing(false)}
          onSave={async (body) => {
            const ok = await run(() => overrideOccurrence(event.id, { originalStart, ...body }), 'This occurrence was updated.')
            if (ok) setEditing(false)
            return ok
          }}
          serverError={error}
        />
      )}
    </Card>
  )
}

function EditOccurrenceDialog({ plan, onCancel, onSave, serverError }) {
  const [form, setForm] = useState({
    date: plan.local.eventStart.date,
    time: to24(plan.local.eventStart.time12),
    travel: String(plan.durations.travelDurationMinutes),
    prep: String(plan.durations.preparationMinutes),
    buffer: String(plan.durations.arrivalBufferMinutes),
    destination: plan.event.destination ?? '',
  })
  const [errors, setErrors] = useState({})
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    const found = {}
    if (!form.date) found.date = 'Pick a date.'
    if (!form.time) found.time = 'Pick a time.'
    if (!minutes(form.travel, 1)) found.travel = 'Enter 1–1440 minutes.'
    if (!minutes(form.prep, 0)) found.prep = 'Enter 0–1440 minutes.'
    if (!minutes(form.buffer, 0)) found.buffer = 'Enter 0–1440 minutes.'
    setErrors(found)
    if (Object.keys(found).length) return
    await onSave({
      startAt: `${form.date}T${form.time}`,
      travelDurationMinutes: Number(form.travel),
      preparationMinutes: Number(form.prep),
      arrivalBufferMinutes: Number(form.buffer),
      destination: form.destination.trim() || null,
    })
  }

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onCancel()} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div role="dialog" aria-modal="true" aria-label="Edit this occurrence" className="w-full max-w-lg rounded-2xl border border-line bg-surface text-ink shadow-lift">
      <form onSubmit={submit} noValidate className="space-y-4 p-6">
        <h2 className="text-lg font-bold">Edit this occurrence</h2>
        <p className="text-sm text-muted">Only this date changes. It can move by up to 7 days.</p>
        {serverError && <Alert>{serverError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput label="Date" type="date" value={form.date} error={errors.date} onChange={set('date')} />
          <FormInput label="Start time" type="time" value={form.time} error={errors.time} onChange={set('time')} />
          <FormInput label="Travel duration" type="number" min="1" suffix="min" value={form.travel} error={errors.travel} onChange={set('travel')} />
          <FormInput label="Preparation time" type="number" min="0" suffix="min" value={form.prep} error={errors.prep} onChange={set('prep')} />
          <FormInput label="Arrival buffer" type="number" min="0" suffix="min" value={form.buffer} error={errors.buffer} onChange={set('buffer')} />
          <FormInput label="Destination" value={form.destination} onChange={set('destination')} />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit">Save this occurrence</Button>
        </div>
      </form>
      </div>
    </div>
  )
}

/** "9:30 AM" -> "09:30" (the plan carries 12-hour display strings). */
function to24(time12) {
  const m = /^(\d{1,2}):(\d{2})\s?(AM|PM)$/i.exec(time12 ?? '')
  if (!m) return ''
  const h = (Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)
  return `${String(h).padStart(2, '0')}:${m[2]}`
}
