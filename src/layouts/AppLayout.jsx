import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { OfflineBanner } from '@/components/common/OfflineBanner'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { SidebarRail } from '@/components/layout/SidebarRail'
import { VerificationBanner } from '@/components/layout/VerificationBanner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * The app shell: a soft purple page with one large rounded container (desktop), a slim icon rail on the left, and the
 * top bar plus page content on the right. On phones and tablets the container goes edge to edge and the rail becomes
 * the labelled drawer opened from the top bar.
 */
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
    <TooltipProvider>
      <div className="min-h-dvh bg-shell lg:p-5">
        <div className="relative mx-auto flex min-h-dvh max-w-[1760px] bg-canvas lg:min-h-[calc(100dvh-2.5rem)] lg:rounded-[32px] lg:shadow-shell">
          {/* Desktop: slim icon rail, sticky inside the rounded container */}
          <aside className="sticky top-5 z-40 hidden h-[calc(100dvh-2.5rem)] w-[84px] shrink-0 self-start rounded-l-[32px] border-r border-line bg-surface lg:block">
            <SidebarRail />
          </aside>

          {/* Mobile drawer */}
          <div className={cn('fixed inset-0 z-50 lg:hidden', !drawerOpen && 'pointer-events-none')} aria-hidden={!drawerOpen}>
            <div
              onClick={() => setDrawerOpen(false)}
              className={cn('absolute inset-0 bg-ink/40 backdrop-blur-sm transition-opacity duration-200', drawerOpen ? 'opacity-100' : 'opacity-0')}
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

          <div className="flex min-w-0 flex-1 flex-col">
            <AppNavbar onMenuClick={() => setDrawerOpen(true)} />
            <VerificationBanner />
            <OfflineBanner />
            <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {/* Re-keyed per route so each page fades in (one short fade; disabled by prefers-reduced-motion). */}
              <div key={pathname} className="anim-fade">
                <Outlet />
              </div>
            </main>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
