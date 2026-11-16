import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { cn } from '@/lib/utils'

export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { pathname } = useLocation()

  // Reset scroll position when navigating between pages.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e) => e.key === 'Escape' && setDrawerOpen(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-line lg:block">
        <AppSidebar />
      </aside>

      {/* Mobile drawer */}
      <div className={cn('fixed inset-0 z-50 lg:hidden', !drawerOpen && 'pointer-events-none')} aria-hidden={!drawerOpen}>
        <div
          onClick={() => setDrawerOpen(false)}
          className={cn('absolute inset-0 bg-ink/40 transition-opacity duration-200', drawerOpen ? 'opacity-100' : 'opacity-0')}
        />
        <aside
          className={cn(
            'absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-lift transition-transform duration-200',
            drawerOpen ? 'translate-x-0' : '-translate-x-full',
          )}
          inert={!drawerOpen}
        >
          <AppSidebar showClose onClose={() => setDrawerOpen(false)} onNavigate={() => setDrawerOpen(false)} />
        </aside>
      </div>

      <div className="lg:pl-64">
        <AppNavbar onMenuClick={() => setDrawerOpen(true)} />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
