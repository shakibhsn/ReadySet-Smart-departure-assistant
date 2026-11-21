import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, DoorOpen, Play, Timer, XCircle } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useEventQuery } from '@/hooks/useEventQuery'
import { getPrepState, logPrepAction } from '@/services/prepApi'

/**
 * Optional one-tap logging that feeds YOUR preparation profile. The server stamps every time; nothing here changes the
 * event or its departure plan.
 */
export function PrepLogPanel({ event }) {
  const query = useEventQuery(() => getPrepState(event.id).catch(() => null), [event.id])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const data = query.data
  if (!data || data.enabled === false || !data.occurrenceStart) return null // optional: hidden when off, unavailable or no upcoming occurrence

  const log = data.log
  const open = data.window?.open
  const started = Boolean(log?.prepStartedAt) && !log?.cancelledAt
  const finished = Boolean(log?.readyAt)
  const left = Boolean(log?.leftAt)

  const tap = async (action) => {
    setBusy(true)
    setError('')
    try {
      await logPrepAction(event.id, action)
      query.reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card aria-label="Preparation log">
      <CardHeader>
        <div>
          <CardTitle>Log your preparation</CardTitle>
          <CardDescription>Optional. Builds <Link to="/profile" className="font-semibold text-brand-700 hover:underline">your preparation profile</Link>. Times are recorded by the server when you tap.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert>{error}</Alert>}
        {left ? (
          <p className="flex items-center gap-2 text-sm text-accent-700"><CheckCircle2 className="size-4" /> Logged.{log.actualPrepMinutes !== null && ` Preparation took ${log.actualPrepMinutes} min.`}{log.latenessMinutes !== null && (log.latenessMinutes > 0 ? ` You left ${log.latenessMinutes} min after the planned time.` : ' You left on time or early.')}</p>
        ) : !open ? (
          <p className="text-sm text-muted">Logging opens 1 hour before preparation is planned to start.</p>
        ) : (
          <>
            {log?.cancelledAt && <p className="text-sm text-muted">Session cancelled (it will not count towards your profile).</p>}
            {started && !finished && <p className="flex items-center gap-2 text-sm text-muted"><Timer className="size-4" /> Preparation started. Tap "I&apos;m ready" when you are done.</p>}
            {finished && <p className="flex items-center gap-2 text-sm text-muted"><CheckCircle2 className="size-4 text-accent-600" /> Ready{log.actualPrepMinutes !== null && ` after ${log.actualPrepMinutes} min`}. Tap "I left" when you walk out.</p>}
            <div className="flex flex-wrap gap-2">
              {(!started || log?.cancelledAt) && !finished && <Button size="sm" onClick={() => tap('start')} disabled={busy}><Play className="size-4" /> Start preparing</Button>}
              {started && !finished && <Button size="sm" onClick={() => tap('ready')} disabled={busy}><CheckCircle2 className="size-4" /> I&apos;m ready</Button>}
              {started && !finished && <Button size="sm" variant="ghost" onClick={() => tap('cancel')} disabled={busy}><XCircle className="size-4" /> Cancel session</Button>}
              {(started || finished) && <Button size="sm" variant="outline" onClick={() => tap('left')} disabled={busy}><DoorOpen className="size-4" /> I left</Button>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
