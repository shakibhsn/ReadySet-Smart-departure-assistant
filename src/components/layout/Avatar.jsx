import { cn } from '@/lib/utils'

export function Avatar({ initials, className }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-800 text-sm font-bold text-white',
        className,
      )}
    >
      {initials}
    </span>
  )
}
