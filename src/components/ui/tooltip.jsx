import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

// shadcn/ui Tooltip (new-york), themed with the ReadySet tokens.
export const TooltipProvider = ({ delayDuration = 150, ...props }) => <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export function TooltipContent({ className, sideOffset = 8, ...props }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn('anim-fade z-50 rounded-lg bg-brand-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lift', className)}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}
