import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Lightbulb, TriangleAlert } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { Skeleton } from '@/components/common/LoadingSkeleton'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useEventQuery } from '@/hooks/useEventQuery'
import { getConflicts } from '@/services/scheduleApi'
import { formatDayLabel } from '@/utils/format'

const SEVERITY = {
  high: { label: 'High', tone: 'bg-rose-50 text-rose-700 ring-rose-200', icon: TriangleAlert },
  medium: { label: 'Medium', tone: 'bg-amber-50 text-amber-700 ring-amber-200', icon: AlertTriangle },
}

/**
 * Schedule conflicts for the next two weeks, calculated by the backend (read-only: nothing is ever changed).
 * `compact` (dashboard): renders nothing when there is nothing to report or the check fails.
 */
export function ConflictsCard({ days = 14, compact = false }) {
  const query = useEventQuery(() => getConflicts({ days }), [days])
  // Defensive: an unexpected response shape is treated as "nothing to report" rather than crashing the page.
  const data = query.data && Array.isArray(query.data.conflicts) ? query.data : null

  if (compact && (!data || data.conflicts.length === 0)) return null

  return (
    <Card aria-label="Schedule conflicts">
      <CardHeader>
        <div>
          <CardTitle>Schedule conflicts</CardTitle>
          <CardDescription>Next {days} days{data ? ` · ${data.eventsChecked} ${data.eventsChecked === 1 ? 'event' : 'events'} checked` : ''}</CardDescription>
        </div>
        {data && data.conflicts.length > 0 && <Badge className="bg-rose-50 text-rose-700 ring-rose-200">{data.conflicts.length}</Badge>}
      </CardHeader>
      <CardContent className="space-y-4">
        {query.loading && !data ? (
          <div role="status" aria-label="Checking your schedule" className="space-y-3"><Skeleton className="h-16" /></div>
        ) : query.error ? (
          <Alert>
            {query.error.message}{' '}
            <button type="button" onClick={query.reload} className="font-bold underline">Try again</button>
          </Alert>
        ) : !data || data.conflicts.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted"><CheckCircle2 className="size-4 text-accent-600" /> No conflicts found.</p>
        ) : (
          <ul className="space-y-3">
            {data.conflicts.map((c) => {
              const { label, tone, icon: Icon } = SEVERITY[c.severity]
              return (
                <li key={c.id} className="rounded-xl border border-line p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={tone}><Icon className="size-3.5" /> {label}</Badge>
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">{c.type.replace('_', ' ').toLowerCase()}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-ink">{c.message}</p>
                  <p className="mt-1 text-xs text-muted">
                    {c.events.map((e, i) => (
                      <span key={e.eventId + e.startAt}>
                        {i > 0 && ' · '}
                        <Link to={`/events/${e.eventId}`} className="font-semibold text-brand-700 hover:underline">{e.title}</Link>
                        {e.assumedDuration && ' (duration assumed)'}
                      </span>
                    ))}
                  </p>
                  <p className="mt-2 flex gap-2 rounded-lg bg-accent-50 p-3 text-sm text-accent-700">
                    <Lightbulb className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Suggestion: start &quot;{c.suggestion.title}&quot; on {formatDayLabel(c.suggestion.local.date)} at {c.suggestion.local.time12} ({c.suggestion.shiftMinutes} min later). Nothing has been changed.
                    </span>
                  </p>
                </li>
              )
            })}
          </ul>
        )}
        {data && (
          <details className="text-xs text-muted">
            <summary className="cursor-pointer font-semibold">How conflicts are checked</summary>
            <ul className="mt-2 list-inside list-disc space-y-1">{(data.assumptions ?? []).map((a) => <li key={a}>{a}</li>)}</ul>
          </details>
        )}
      </CardContent>
    </Card>
  )
}
