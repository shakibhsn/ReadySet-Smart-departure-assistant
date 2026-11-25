import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut, X } from 'lucide-react'
import { Logo } from '@/components/common/Logo'
import { InstallAppButton } from '@/components/common/InstallAppButton'
import { Avatar } from './Avatar'
import { useNotifications } from '@/hooks/useNotifications'
import { useAuth } from '@/hooks/useAuth'
import { getInitials } from '@/utils/format'
import { NAV_ITEMS } from '@/routes/navigation'
import { cn } from '@/lib/utils'

export function AppSidebar({ onNavigate, onClose, showClose = false }) {
  const navigate = useNavigate()
  const { unreadCount: unread } = useNotifications()
  const { user, logout } = useAuth()

  const handleLogout = async () => {
    onNavigate?.()
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-16 items-center justify-between px-5">
        <Logo />
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex size-10 cursor-pointer items-center justify-center rounded-xl text-muted hover:bg-brand-50"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-[background-color,color,box-shadow] duration-150',
                isActive ? 'bg-lime text-lime-ink' : 'text-muted hover:bg-brand-50 hover:text-brand-700',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="anim-fade absolute -left-3 top-2 bottom-2 w-1 rounded-r-full bg-lime-ink" aria-hidden="true" />
                )}
                <Icon className={cn('size-5', isActive ? 'text-lime-ink' : 'text-slate-400 group-hover:text-brand-600')} />
                <span className="flex-1">{label}</span>
                {label === 'Notifications' && unread > 0 && (
                  <span className="tabular rounded-full bg-accent-fill px-2 py-0.5 text-xs font-bold text-on-accent">{unread}</span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-xl p-2">
          <Avatar initials={getInitials(user?.name)} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">{user?.name}</p>
            <p className="truncate text-xs text-muted">{user?.email}</p>
          </div>
        </div>
        <InstallAppButton />
        <button
          type="button"
          onClick={handleLogout}
          className="mt-1 flex h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted transition-colors hover:bg-rose-50 hover:text-rose-600"
        >
          <LogOut className="size-5" />
          Log out
        </button>
      </div>
    </div>
  )
}
