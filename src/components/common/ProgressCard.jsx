import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

/** Compact labeled progress block used for checklist completion. */
export function ProgressCard({ title, done, total, percent, className }) {
  return (
    <Card className={className}>
      <div className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <span className="text-2xl font-extrabold tracking-tight text-brand-700">{percent}%</span>
        </div>
        <Progress value={percent} label={title} className="mt-3" />
        <p className="mt-2 text-xs text-muted">
          {done} of {total} items complete
        </p>
      </div>
    </Card>
  )
}
