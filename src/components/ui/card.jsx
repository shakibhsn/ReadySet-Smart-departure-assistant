import { cn } from '@/lib/utils'

export function Card({ className, ...props }) {
  return (
    <div className={cn('rounded-2xl border border-line bg-surface shadow-card', className)} {...props} />
  )
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex items-start justify-between gap-3 p-5 pb-3 sm:p-6 sm:pb-3', className)} {...props} />
}

export function CardTitle({ className, ...props }) {
  return <h2 className={cn('text-base font-bold tracking-tight text-ink', className)} {...props} />
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('mt-0.5 text-sm text-muted', className)} {...props} />
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-5 pt-2 sm:p-6 sm:pt-2', className)} {...props} />
}
