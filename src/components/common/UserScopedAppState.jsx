import { AppStateProvider } from './AppStateProvider'
import { EventsProvider } from './EventsProvider'
import { NotificationsProvider } from './NotificationsProvider'
import { useAuth } from '@/hooks/useAuth'

/**
 * Re-creates all per-user client state whenever the signed-in user changes (login, logout,
 * switching accounts): the event refetch cache, notifications and the temporary device settings.
 * One user's data therefore never carries over to another user in the same tab, and a new login
 * always refetches events from the API.
 */
export function UserScopedAppState({ children }) {
  const { user } = useAuth()
  return (
    <AppStateProvider key={user?.id ?? 'signed-out'}>
      <NotificationsProvider>
        <EventsProvider>{children}</EventsProvider>
      </NotificationsProvider>
    </AppStateProvider>
  )
}
