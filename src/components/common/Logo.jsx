import { cn } from '@/lib/utils'

export function Logo({ className }) {
  return (
    <img
      src="/readyset-logo.png"
      alt="ReadySet"
      className={cn('h-14 w-14 object-contain', className)}
    />
  )
}
