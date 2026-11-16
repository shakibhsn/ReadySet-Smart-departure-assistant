import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function Ring({ percent, size = 112, stroke = 10 }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-brand-100)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-accent-500)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * percent) / 100}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold tracking-tight">{percent}%</span>
        <span className="text-[11px] font-semibold uppercase text-muted">ready</span>
      </div>
    </div>
  )
}

export function ReadinessCard({ eventTitle, done, total, percent }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Readiness overview</CardTitle>
          <CardDescription className="truncate">{eventTitle ?? 'No upcoming event'}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-5">
          <div role="img" aria-label={`${percent}% ready`}>
            <Ring percent={percent} />
          </div>
          <dl className="grid flex-1 grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-accent-50 px-2 py-3">
              <dd className="text-xl font-extrabold text-accent-700">{done}</dd>
              <dt className="text-xs font-medium text-muted">Completed</dt>
            </div>
            <div className="rounded-xl bg-brand-50 px-2 py-3">
              <dd className="text-xl font-extrabold text-brand-700">{total - done}</dd>
              <dt className="text-xs font-medium text-muted">Remaining</dt>
            </div>
          </dl>
        </div>
      </CardContent>
    </Card>
  )
}
