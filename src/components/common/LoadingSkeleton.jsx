import { cn } from '@/lib/utils'

export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-xl bg-brand-100/70', className)} aria-hidden="true" />
}

/** Generic page-level loading placeholder: header + a grid of card blocks. */
export function LoadingSkeleton({ cards = 4 }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-48 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: cards }, (_, i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
    </div>
  )
}
