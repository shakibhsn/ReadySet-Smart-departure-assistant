import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, Menu, Search, Settings } from 'lucide-react'
import { Avatar } from './Avatar'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { useAuth } from '@/hooks/useAuth'
import { getInitials } from '@/utils/format'
import { getPageTitle } from '@/routes/navigation'

export function AppNavbar({ onMenuClick }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e) => !menuRef.current?.contains(e.target) && setMenuOpen(false)
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        className="flex size-11 cursor-pointer items-center justify-center rounded-xl text-ink hover:bg-brand-50 lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-sm sm:flex">
        <span className="text-muted">ReadySet</span>
        <span className="text-slate-300">/</span>
        <span className="truncate font-bold text-ink">{getPageTitle(pathname)}</span>
      </nav>
      <p className="truncate text-base font-bold sm:hidden">{getPageTitle(pathname)}</p>

      <div className="ml-auto flex items-center gap-2">
        <form role="search" onSubmit={(e) => e.preventDefault()} className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            aria-label="Search events"
            placeholder="Search events…"
            className="h-10 w-56 rounded-xl border border-line bg-canvas pl-10 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-brand-100 lg:w-72"
          />
        </form>

        <NotificationBell />

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Account menu"
            className="flex h-11 cursor-pointer items-center gap-2 rounded-xl pl-1 pr-2 hover:bg-brand-50"
          >
            <Avatar initials={getInitials(user?.name)} className="size-9" />
            <ChevronDown className="hidden size-4 text-muted sm:block" />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 mt-2 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-lift">
              <div className="px-3 py-2">
                <p className="truncate text-sm font-bold">{user?.name}</p>
                <p className="truncate text-xs text-muted">{user?.email}</p>
              </div>
              <hr className="my-1 border-line" />
              <button
                role="menuitem"
                onClick={() => { setMenuOpen(false); navigate('/settings') }}
                className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-sm font-medium hover:bg-brand-50"
              >
                <Settings className="size-4 text-muted" /> Settings
              </button>
              <button
                role="menuitem"
                onClick={async () => {
                  setMenuOpen(false)
                  await logout()
                  navigate('/login', { replace: true })
                }}
                className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-rose-600 hover:bg-rose-50"
              >
                <LogOut className="size-4" /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
