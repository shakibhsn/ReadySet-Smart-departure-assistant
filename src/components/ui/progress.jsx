import { cn } from '@/lib/utils'

export function Progress({ value = 0, className, barClassName, label = 'Progress' }) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-brand-100', className)}
    >
      <div
        className={cn('h-full rounded-full bg-brand-600 transition-[width] duration-500', barClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
