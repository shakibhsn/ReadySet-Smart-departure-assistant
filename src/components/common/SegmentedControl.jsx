import { cn } from '@/lib/utils'

export function SegmentedControl({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 min-w-16 cursor-pointer rounded-lg px-3.5 text-sm font-semibold transition-colors',
            value === o.value ? 'bg-brand-600 text-white shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
