import { AppStateProvider } from './AppStateProvider'
import { EventsProvider } from './EventsProvider'
import { useAuth } from '@/hooks/useAuth'

/**
 * Re-creates all per-user client state whenever the signed-in user changes (login, logout,
 * switching accounts): the event refetch cache and the temporary checklist / notification state.
 * One user's data therefore never carries over to another user in the same tab, and a new login
 * always refetches events from the API.
 */
export function UserScopedAppState({ children }) {
  const { user } = useAuth()
  return (
    <AppStateProvider key={user?.id ?? 'signed-out'}>
      <EventsProvider>{children}</EventsProvider>
    </AppStateProvider>
  )
}
