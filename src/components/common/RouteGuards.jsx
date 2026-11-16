import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Logo } from './Logo'

function AuthLoading() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen flex-col items-center justify-center gap-5">
      <Logo />
      <div className="size-8 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
      <span className="sr-only">Checking your session…</span>
    </div>
  )
}

/** Renders child routes only for signed-in users. Never renders protected content while loading. */
export function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()
  if (loading) return <AuthLoading />
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

/** Login / register pages: signed-in users are sent to the dashboard instead. */
export function PublicOnlyRoute() {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <AuthLoading />
  if (isAuthenticated) return <Navigate to="/" replace />
  return <Outlet />
}
