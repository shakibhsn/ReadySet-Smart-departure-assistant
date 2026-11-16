import { CalendarPlus } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { ButtonLink } from '@/components/ui/button'
import { EventCard } from './EventCard'

export function ScheduleList({ events, showDay = false, emptyTitle = 'Nothing scheduled', emptyDescription }) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={CalendarPlus}
        title={emptyTitle}
        description={emptyDescription ?? 'Add an event and ReadySet will work out when you should leave.'}
        action={<ButtonLink to="/events/new">Create event</ButtonLink>}
      />
    )
  }
  return (
    <ul className="space-y-3">
      {events.map((e) => (
        <li key={e.id}>
          <EventCard event={e} showDay={showDay} />
        </li>
      ))}
    </ul>
  )
}
