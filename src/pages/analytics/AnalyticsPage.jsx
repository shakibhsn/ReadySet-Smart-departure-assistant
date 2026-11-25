import { useMemo, useState } from 'react'
import { BarChart3, Info } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { EmptyState } from '@/components/common/EmptyState'
import { FormInput } from '@/components/common/FormInput'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { PageHeader } from '@/components/common/PageHeader'
import { SegmentedControl } from '@/components/common/SegmentedControl'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useEventQuery } from '@/hooks/useEventQuery'
import { getAnalytics } from '@/services/analyticsApi'

const isoDay = (offset = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A figure, or the honest reason there is none. Never a made-up number. */
export function Metric({ label, metric, format, hint }) {
  const ok = metric?.status === 'ok'
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs font-semibold text-muted">{label}</p>
      {ok ? (
        <p className="mt-1 text-2xl font-extrabold text-ink">{format(metric)}</p>
      ) : (
        <p className="mt-1 text-sm text-muted">Not enough data yet ({metric?.samples ?? 0} of {metric?.needed ?? 3})</p>
      )}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}

/** Plain bars: height = value, empty bar = no data (distinct from 0%). */
export function TrendBars({ title, points, valueOf, unit }) {
  const max = Math.max(100, ...points.map((p) => valueOf(p) ?? 0))
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-bold text-ink">{title}</figcaption>
      <ul className="flex h-32 items-end gap-1.5" aria-label={title}>
        {points.map((p) => {
          const v = valueOf(p)
          return (
            <li key={p.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${p.label}: ${v === null ? 'no data' : `${v}${unit}`}`}>
              <span className="text-[10px] font-semibold text-muted">{v === null ? '–' : `${v}${unit}`}</span>
              <span className={v === null ? 'h-1 w-full rounded bg-line' : 'w-full rounded-t bg-brand-500'} style={v === null ? undefined : { height: `${Math.max(4, (v / max) * 100)}%` }} />
            </li>
          )
        })}
      </ul>
      <div className="mt-1 flex gap-1.5">{points.map((p) => <span key={p.key} className="min-w-0 flex-1 truncate text-center text-[10px] text-muted">{p.label.replace('Week of ', '')}</span>)}</div>
    </figure>
  )
}

export default function AnalyticsPage() {
  const [granularity, setGranularity] = useState('week')
  const [range, setRange] = useState({ from: isoDay(-27), to: isoDay(0) })
  const valid = range.from && range.to && range.from <= range.to
  const params = useMemo(() => ({ from: range.from, to: range.to, granularity }), [range, granularity])
  const query = useEventQuery(() => (valid ? getAnalytics(params) : Promise.resolve(null)), [params, valid])
  const data = query.data

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" description="Calculated only from your own events, checklists and the preparation taps you logged." />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <FormInput label="From" type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        <FormInput label="To" type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        <SegmentedControl label="Trend interval" value={granularity} onChange={setGranularity} options={[{ value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }]} />
      </div>
      {!valid && <Alert>Choose a start date that is not after the end date.</Alert>}
      {query.error && !data && <Alert>{query.error.message}</Alert>}
      {query.loading && !data && valid && <LoadingSkeleton cards={2} />}

      {data && !data.hasEvents && (
        <EmptyState icon={BarChart3} title="No events in this period" description="Add events, then use Start preparing, I'm ready and I left on an event page. Your statistics appear here once there are at least 3 data points." action={<ButtonLink to="/events/new">Add an event</ButtonLink>} />
      )}

      {data && data.hasEvents && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {data.preparationTracking === 'available' && <Metric label="Preparations completed" metric={data.preparation?.completion} format={(m) => `${m.percent}%`} hint={data.preparation?.completion?.status === 'ok' ? `${data.preparation.completion.count} of ${data.preparation.completion.of} past events` : 'Past events with a completed log'} />}
            {data.preparationTracking === 'available' && <Metric label="Left on time" metric={data.departure?.onTime} format={(m) => `${m.percent}%`} hint={`Within ${data.departure?.graceMinutes ?? 5} min of plan`} />}
            {data.preparationTracking === 'available' && <Metric label="Average preparation" metric={data.preparation?.average} format={(m) => `${m.minutes} min`} hint="From logged sessions" />}
            <Metric label="Checklist completion" metric={data.checklist.rate} format={(m) => `${m.percent}%`} hint={`${data.checklist.doneItems} of ${data.checklist.totalItems} items${data.checklist.completedInRange === null || data.checklist.completedInRange === undefined ? '' : ` · ${data.checklist.completedInRange} ticked in this period`}`} />
          </div>
          {data.preparationTracking === 'unavailable' && <Alert>Preparation tracking is not available yet, so the preparation and departure figures are hidden rather than shown as zero.</Alert>}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Trends</CardTitle>
                <CardDescription>{granularity === 'week' ? 'By week' : 'By month'}. A dash means there was not enough data.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-8 md:grid-cols-2">
              <TrendBars title="Events" points={data.trend} valueOf={(p) => p.events} unit="" />
              <TrendBars title="Checklist completion" points={data.trend} valueOf={(p) => (p.checklist.status === 'ok' ? p.checklist.percent : null)} unit="%" />
              {data.preparationTracking === 'available' && <TrendBars title="Left on time" points={data.trend} valueOf={(p) => (p.onTime?.status === 'ok' ? p.onTime.percent : null)} unit="%" />}
              {data.preparationTracking === 'available' && <TrendBars title="Average preparation (min)" points={data.trend} valueOf={(p) => (p.averagePrep?.status === 'ok' ? p.averagePrep.minutes : null)} unit="" />}
            </CardContent>
          </Card>
          <ul className="space-y-1 text-xs text-muted">
            {data.notes.map((n) => <li key={n} className="flex gap-1.5"><Info className="mt-0.5 size-3.5 shrink-0" /> {n}</li>)}
          </ul>
        </>
      )}
    </div>
  )
}
