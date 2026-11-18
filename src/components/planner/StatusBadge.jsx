import { Badge } from '@/components/ui/badge'
import { STATUS_META } from '@/utils/departureStatus'
import { cn } from '@/lib/utils'

const LIGHT = {
  info: 'bg-brand-50 text-brand-700 ring-brand-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  late: 'bg-rose-50 text-rose-700 ring-rose-200',
}
const DARK = {
  info: 'bg-white/10 text-brand-100 ring-white/20',
  warn: 'bg-amber-400/20 text-amber-100 ring-amber-300/40',
  late: 'bg-rose-400/20 text-rose-100 ring-rose-300/40',
}

export function StatusBadge({ status, onDark = false, className }) {
  const meta = STATUS_META[status] ?? { label: status, tone: 'info' }
  return <Badge className={cn((onDark ? DARK : LIGHT)[meta.tone], className)}>{meta.label}</Badge>
}
