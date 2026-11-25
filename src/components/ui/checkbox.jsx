import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Accessible styled checkbox: a real <input> sits invisibly over a custom box. */
export function Checkbox({ className, id, ...props }) {
  return (
    <span className={cn('relative inline-flex size-5 shrink-0', className)}>
      <input id={id} type="checkbox" className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0" {...props} />
      <span className="pointer-events-none flex size-5 items-center justify-center rounded-md border-2 border-slate-300 bg-surface text-transparent transition-colors peer-checked:border-accent-fill peer-checked:bg-accent-fill peer-checked:text-on-accent peer-active:scale-90 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    </span>
  )
}
