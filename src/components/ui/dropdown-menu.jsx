import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'

// shadcn/ui DropdownMenu (new-york), themed with the ReadySet tokens. Keyboard, focus and ARIA come from Radix.
export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

export function DropdownMenuContent({ className, sideOffset = 8, ...props }) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn('anim-pop z-50 min-w-56 rounded-2xl border border-line bg-surface p-1.5 text-ink shadow-lift', className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export function DropdownMenuItem({ className, destructive = false, ...props }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'flex h-10 cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 text-sm font-medium outline-none transition-colors data-[highlighted]:bg-brand-50',
        destructive ? 'text-rose-600 data-[highlighted]:bg-rose-50' : 'text-ink',
        className,
      )}
      {...props}
    />
  )
}

export const DropdownMenuLabel = ({ className, ...props }) => <DropdownMenuPrimitive.Label className={cn('px-3 py-2', className)} {...props} />
export const DropdownMenuSeparator = ({ className, ...props }) => <DropdownMenuPrimitive.Separator className={cn('my-1 h-px bg-line', className)} {...props} />
