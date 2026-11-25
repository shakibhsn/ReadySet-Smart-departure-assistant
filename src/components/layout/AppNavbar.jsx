import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, Menu, Settings } from 'lucide-react'
import { Avatar } from './Avatar'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useAuth } from '@/hooks/useAuth'
import { getInitials } from '@/utils/format'
import { getPageTitle } from '@/routes/navigation'

/**
 * Top bar: the page title, notifications (existing feature) and the account menu (shadcn DropdownMenu).
 * The old search box was removed: it never searched anything (no search API exists), and fake controls are worse than none.
 */
export function AppNavbar({ onMenuClick }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur sm:px-6 lg:rounded-tr-[32px] lg:px-8">
      <button type="button" onClick={onMenuClick} aria-label="Open menu" className="flex size-11 cursor-pointer items-center justify-center rounded-2xl text-ink hover:bg-brand-50 lg:hidden">
        <Menu className="size-5" />
      </button>

      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-sm sm:flex">
        <span className="text-muted">ReadySet</span>
        <span className="text-slate-300">/</span>
        <span className="truncate font-bold text-ink">{getPageTitle(pathname)}</span>
      </nav>
      <p className="truncate text-base font-bold sm:hidden">{getPageTitle(pathname)}</p>

      <div className="ml-auto flex items-center gap-2">
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Account menu" className="flex h-11 cursor-pointer items-center gap-2 rounded-2xl pl-1 pr-2 outline-none hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500">
              <Avatar initials={getInitials(user?.name)} className="size-9" />
              <ChevronDown className="hidden size-4 text-muted sm:block" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <p className="truncate text-sm font-bold">{user?.name}</p>
              <p className="truncate text-xs font-normal text-muted">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/settings')}>
              <Settings className="size-4 text-muted" /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              destructive
              onSelect={async () => {
                await logout()
                navigate('/login', { replace: true })
              }}
            >
              <LogOut className="size-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
