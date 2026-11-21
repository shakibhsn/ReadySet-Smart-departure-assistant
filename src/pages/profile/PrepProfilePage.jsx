import { useState } from 'react'
import { Gauge, Trash2 } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { FormInput } from '@/components/common/FormInput'
import { FormSelect } from '@/components/common/FormSelect'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { EVENT_CATEGORIES } from '@/data/categories'
import { useEventQuery } from '@/hooks/useEventQuery'
import { clearOverride, deletePrepLog, erasePrepData, getPrepLogs, getPrepProfile, saveOverride, setProfileEnabled } from '@/services/prepApi'
import { formatDayLabel } from '@/utils/format'

const TONE = { low: 'bg-amber-50 text-amber-700 ring-amber-200', medium: 'bg-sky-50 text-sky-700 ring-sky-200', high: 'bg-accent-50 text-accent-700 ring-accent-200' }
const label = (c) => EVENT_CATEGORIES.find((x) => x.value === c)?.label ?? c

function Suggestion({ title, s, onUse }) {
  if (!s) return null
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold">{title}</h3>
        {s.status === 'ok' && <Badge className={TONE[s.confidence]}>{s.confidence} confidence · {s.samples} logged</Badge>}
      </div>
      {s.status === 'ok' ? (
        <>
          <p className="mt-1 text-2xl font-extrabold tabular">{s.minutes} min</p>
          <details className="mt-1 text-xs text-muted"><summary className="cursor-pointer font-semibold">How this is calculated</summary><p className="mt-1">{s.explanation}</p></details>
          {onUse && <Button size="sm" variant="outline" className="mt-3" onClick={onUse}>Use this as my value</Button>}
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">{s.message}</p>
      )}
    </div>
  )
}

export default function PrepProfilePage() {
  const query = useEventQuery(() => getPrepProfile(), [])
  const logs = useEventQuery(() => getPrepLogs().catch(() => []), [])
  const [form, setForm] = useState({ category: 'office', prep: '', buffer: '' })
  const [error, setError] = useState('')
  const [confirmErase, setConfirmErase] = useState(false)

  if (query.loading && !query.data) return <LoadingSkeleton cards={2} />
  if (query.error) {
    return <Alert>{query.error.message}{' '}<button type="button" onClick={query.reload} className="font-bold underline">Try again</button></Alert>
  }
  const p = query.data
  const run = async (fn) => {
    setError('')
    try {
      await fn()
      query.reload()
      logs.reload()
    } catch (err) {
      setError(err.message)
    }
  }
  const save = () => {
    const body = { category: form.category, ...(form.prep !== '' && { prepMinutes: Number(form.prep) }), ...(form.buffer !== '' && { bufferMinutes: Number(form.buffer) }) }
    if (body.prepMinutes === undefined && body.bufferMinutes === undefined) return setError('Enter a preparation time and/or a buffer.')
    run(() => saveOverride(body))
  }
  const overrides = Object.entries(p.overrides ?? {})

  return (
    <div className="space-y-6">
      <PageHeader title="Preparation Profile" description="Your own habits, from the preparations you choose to log. Suggestions never change your events." />
      {error && <Alert>{error}</Alert>}

      <Card>
        <CardContent className="flex items-center justify-between gap-4 pt-6 sm:pt-6">
          <div>
            <p className="text-sm font-semibold">Use my activity to personalize suggestions</p>
            <p className="text-sm text-muted">Based only on your "Start preparing", "I&apos;m ready" and "I left" taps. Nothing is inferred from your checklist or anything else. Turn it off to stop logging and suggestions.</p>
          </div>
          <Switch label="Use my activity to personalize suggestions" checked={p.enabled} onCheckedChange={(v) => run(() => setProfileEnabled(v))} />
        </CardContent>
      </Card>

      {!p.enabled ? (
        <EmptyState icon={Gauge} title="The profile is turned off" description={p.message} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Suggestion title="Preparation time (all events)" s={p.preparation.overall} />
            <Suggestion title="Departure buffer" s={p.buffer} onUse={p.buffer?.status === 'ok' ? () => setForm((f) => ({ ...f, buffer: String(p.buffer.minutes) })) : undefined} />
            {Object.entries(p.preparation.byCategory).map(([c, s]) => (
              <Suggestion key={c} title={`Preparation time: ${label(c)}`} s={s} onUse={s.status === 'ok' ? () => setForm((f) => ({ ...f, category: c, prep: String(s.minutes) })) : undefined} />
            ))}
          </div>

          <Card>
            <CardHeader><div><CardTitle>This week</CardTitle><CardDescription>Last 7 days of logged activity</CardDescription></div></CardHeader>
            <CardContent>
              {p.weekly.message ? (
                <p className="text-sm text-muted">{p.weekly.message}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  <li>{p.weekly.eventsLogged} {p.weekly.eventsLogged === 1 ? 'event' : 'events'} logged</li>
                  {p.weekly.avgActualPrepMinutes !== null && <li>Preparation: {p.weekly.avgActualPrepMinutes} min on average (planned {p.weekly.avgPlannedPrepMinutes} min)</li>}
                  {p.weekly.departuresLogged > 0 && <li>On time (within 5 min): {p.weekly.onTimeDepartures} of {p.weekly.departuresLogged} departures</li>}
                  {p.weekly.uncheckedWhenLeaving.length > 0 && <li>Still unchecked when you left: {p.weekly.uncheckedWhenLeaving.map((i) => `${i.name} (${i.times}×)`).join(', ')}</li>}
                </ul>
              )}
              {p.oftenUnchecked.length > 0 && <p className="mt-3 text-xs text-muted">Often unchecked when you left (not the same as forgotten): {p.oftenUnchecked.map((i) => `${i.name} (${i.times}×)`).join(', ')}</p>}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader><div><CardTitle>My own values</CardTitle><CardDescription>You decide. These override suggestions in the event form.</CardDescription></div></CardHeader>
        <CardContent className="space-y-4">
          {overrides.length > 0 && (
            <ul className="space-y-2">
              {overrides.map(([c, v]) => (
                <li key={c} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-4 py-2 text-sm">
                  <span><strong>{label(c)}</strong>: {v.prepMinutes !== undefined && `preparation ${v.prepMinutes} min`}{v.prepMinutes !== undefined && v.bufferMinutes !== undefined && ', '}{v.bufferMinutes !== undefined && `buffer ${v.bufferMinutes} min`}</span>
                  <Button size="sm" variant="ghost" onClick={() => run(() => clearOverride(c))} aria-label={`Clear my value for ${label(c)}`}>Clear</Button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
            <FormSelect label="Category" options={EVENT_CATEGORIES} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
            <FormInput label="Preparation" type="number" min="0" suffix="min" value={form.prep} onChange={(e) => setForm((f) => ({ ...f, prep: e.target.value }))} />
            <FormInput label="Buffer" type="number" min="0" suffix="min" value={form.buffer} onChange={(e) => setForm((f) => ({ ...f, buffer: e.target.value }))} />
            <Button onClick={save}>Save my value</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>Logged activity</CardTitle><CardDescription>Delete any entry that is wrong, or erase everything.</CardDescription></div></CardHeader>
        <CardContent className="space-y-3">
          {(logs.data ?? []).length === 0 ? (
            <p className="text-sm text-muted">Nothing logged yet.</p>
          ) : (
            <ul className="space-y-2">
              {logs.data.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-4 py-2 text-sm">
                  <span>{label(l.category)} · {formatDayLabel(l.occurrenceStart.slice(0, 10))} · {l.cancelledAt ? 'cancelled' : l.actualPrepMinutes !== null ? `prep ${l.actualPrepMinutes} min` : 'not finished'}{l.latenessMinutes !== null && ` · left ${l.latenessMinutes > 0 ? `${l.latenessMinutes} min late` : 'on time'}`}</span>
                  <Button size="sm" variant="ghost" onClick={() => run(() => deletePrepLog(l.id))} aria-label={`Delete log ${l.id}`} className="hover:bg-rose-50 hover:text-rose-600"><Trash2 className="size-4" /></Button>
                </li>
              ))}
            </ul>
          )}
          {(logs.data ?? []).length > 0 && <Button variant="danger" size="sm" onClick={() => setConfirmErase(true)}>Erase all my activity</Button>}
        </CardContent>
      </Card>

      <ConfirmDialog open={confirmErase} destructive title="Erase all your activity?" description="Every logged preparation is permanently deleted and your suggestions reset. Your events and your own saved values are not affected." confirmLabel="Erase" onCancel={() => setConfirmErase(false)} onConfirm={() => { setConfirmErase(false); run(erasePrepData) }} />
    </div>
  )
}
