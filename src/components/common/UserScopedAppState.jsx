import { AppStateProvider } from './AppStateProvider'
import { useAuth } from '@/hooks/useAuth'

/**
 * Re-creates the in-memory app state whenever the signed-in user changes (login, logout, switching
 * accounts), so one user's temporary events/checklists/notifications never carry over to another
 * user in the same tab. Day 3 replaces this state with per-user data from the API.
 */
export function UserScopedAppState({ children }) {
  const { user } = useAuth()
  return <AppStateProvider key={user?.id ?? 'signed-out'}>{children}</AppStateProvider>
}
