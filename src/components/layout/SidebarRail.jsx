import { NavLink, useMatch, useNavigate, useResolvedPath } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/hooks/useAuth'
import { useNotifications } from '@/hooks/useNotifications'
import { NAV_GROUPS } from '@/routes/navigation'
import { cn } from '@/lib/utils'

const itemClass = 'relative flex size-11 cursor-pointer items-center justify-center rounded-2xl transition-[background-color,color,transform] duration-150 active:scale-95'
const activeClass = 'bg-lime text-lime-ink shadow-card'
const idleClass = 'text-muted hover:bg-brand-50 hover:text-brand-700'

/**
 * One icon link with a tooltip. The active state is computed here (not with NavLink's className callback) because the
 * tooltip trigger merges a plain string className into its child.
 */
function RailLink({ to, label, icon: Icon, end, badge = 0 }) {
  const match = useMatch({ path: useResolvedPath(to).pathname, end: Boolean(end) })
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink to={to} end={end} aria-label={label} className={cn(itemClass, match ? activeClass : idleClass)}>
          <Icon className="size-5" aria-hidden="true" />
          {badge > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-surface">{badge > 99 ? '99+' : badge}</span>
          )}
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

/** The slim icon-only navigation (desktop). Every icon has a tooltip and an accessible name; the active page is a lime pill. */
export function SidebarRail() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { unreadCount } = useNotifications()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <nav aria-label="Main" className="flex h-full flex-col items-center gap-1 py-5">
      <NavLink to="/" aria-label="ReadySet home" className="mb-3 flex size-12 items-center justify-center rounded-2xl">
        <img src="/readyset-logo.png" alt="" className="size-12 object-contain" />
      </NavLink>

      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-2 pb-2">
        {NAV_GROUPS.main.map((group, gi) => (
          <div key={gi} className={cn('flex flex-col items-center gap-1', gi > 0 && 'mt-2 border-t border-line pt-3')}>
            {group.map((item) => (
              <RailLink key={item.to} {...item} badge={item.label === 'Notifications' ? unreadCount : 0} />
            ))}
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-1 border-t border-line pt-3">
        {NAV_GROUPS.bottom.map((item) => (
          <RailLink key={item.to} {...item} />
        ))}
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={handleLogout} aria-label="Log out" className={cn(itemClass, 'text-muted hover:bg-rose-50 hover:text-rose-600')}>
              <LogOut className="size-5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Log out</TooltipContent>
        </Tooltip>
      </div>
    </nav>
  )
}
