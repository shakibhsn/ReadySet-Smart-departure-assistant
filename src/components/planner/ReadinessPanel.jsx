import { AlertTriangle, Info } from 'lucide-react'
import { Countdown } from './Countdown'
import { StatusBadge } from './StatusBadge'
import { cn } from '@/lib/utils'

/**
 * Status + explanation for a plan. `live` is the locally re-derived status (see useLiveReadiness);
 * `stale` means the server text describes an earlier moment, so only status-neutral wording is shown.
 */
export function ReadinessPanel({ view, live, stale = false, preview = false }) {
  const status = live?.status ?? view.status
  const late = status === 'READY_TO_LEAVE' || status === 'ARRIVAL_TARGET_PASSED' || status === 'EVENT_STARTED'
  const milestone = live?.nextMilestone ?? null

  // The server's message is exact for the moment it was calculated; once the status has moved on, fall back to a generic line.
  const generic = {
    UPCOMING: 'Preparation has not started yet.',
    PREPARING: 'Time to get ready.',
    READY_TO_LEAVE: 'It is time to leave.',
    ARRIVAL_TARGET_PASSED: 'Your target arrival time has passed.',
    EVENT_STARTED: 'This event has already started.',
  }[status]
  const message = stale ? generic : view.readiness.message

  return (
    <div className={cn('space-y-3 rounded-2xl border p-4', late ? 'border-amber-200 bg-amber-50/60' : 'border-line bg-surface')}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={status} />
        {preview && <span className="text-xs font-semibold text-muted">Preview only, nothing is saved</span>}
      </div>
      <p className="flex gap-2 text-sm font-medium text-ink" role={late ? 'alert' : undefined}>
        {late ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" /> : <Info className="mt-0.5 size-4 shrink-0 text-brand-600" />}
        <span>{message}</span>
      </p>
      {milestone && live && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{milestone.label} in</p>
          <Countdown seconds={milestone.secondsUntil} label={`Countdown: ${milestone.label}`} />
        </div>
      )}
      <p className="text-sm text-muted">{view.explanation}</p>
    </div>
  )
}
