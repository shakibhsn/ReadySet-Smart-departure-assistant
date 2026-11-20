import { cn } from '@/lib/utils'

/** ReadySet mark: a clock face with a "ready" teal dot. */
export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-9', className)} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--color-brand-600)" />
      <circle cx="16" cy="17" r="8.5" fill="none" stroke="#fff" strokeWidth="2.4" />
      <path d="M16 12.5V17l3 2" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="8" r="3" fill="var(--color-amber-400)" />
    </svg>
  )
}

export function Logo({ className, light = false }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className={cn('text-xl font-extrabold tracking-tight', light ? 'text-white' : 'text-ink')}>
        Ready<span className={light ? 'text-accent-200' : 'text-brand-600'}>Set</span>
      </span>
    </div>
  )
}
