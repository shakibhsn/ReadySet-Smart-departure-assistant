import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function StatCard({ icon: Icon, label, value, hint, tone = 'bg-brand-50 text-brand-600' }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-xl', tone)}>
        <Icon className="size-6" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted">{label}</p>
        <p className="text-2xl font-extrabold tracking-tight text-ink">{value}</p>
        {hint && <p className="truncate text-xs text-muted">{hint}</p>}
      </div>
    </Card>
  )
}
