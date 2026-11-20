import { cn } from '@/lib/utils'

export function ResultCard({ icon: Icon, label, time, formula, featured = false }) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-5 shadow-card transition-transform hover:-translate-y-0.5',
        featured ? 'hero-scope border-transparent bg-hero-gradient text-white' : 'border-line bg-surface',
      )}
    >
      <span
        className={cn(
          'flex size-11 items-center justify-center rounded-xl',
          featured ? 'bg-white/15 text-white' : 'bg-brand-50 text-brand-600',
        )}
      >
        <Icon className="size-5" />
      </span>
      <p className={cn('mt-4 text-sm font-semibold', featured ? 'text-brand-100' : 'text-muted')}>{label}</p>
      <p className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums" aria-live="polite">
        {time}
      </p>
      <p className={cn('mt-2 text-xs', featured ? 'text-brand-200' : 'text-muted')}>{formula}</p>
    </div>
  )
}
