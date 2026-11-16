import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Alert({ variant = 'error', children, className }) {
  const success = variant === 'success'
  const Icon = success ? CheckCircle2 : AlertCircle
  return (
    <div
      role={success ? 'status' : 'alert'}
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium',
        success ? 'border-accent-200 bg-accent-50 text-accent-700' : 'border-rose-200 bg-rose-50 text-rose-700',
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}
