import { cn } from '@/lib/utils'

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-12 text-center',
        className,
      )}
    >
      {Icon && (
        <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Icon className="size-7" />
        </span>
      )}
      <h3 className="text-base font-bold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
