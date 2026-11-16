import { cn } from '@/lib/utils'

export const fieldClass = (error) =>
  cn(
    'h-11 w-full rounded-xl border bg-surface px-3.5 text-sm text-ink placeholder:text-slate-400 transition-colors',
    'focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100',
    error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : 'border-line hover:border-slate-300',
  )

export const describedBy = (id, error, hint) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined
