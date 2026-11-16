import { useEffect } from 'react'
import { CalendarDays, CalendarPlus, Compass } from 'lucide-react'
import { format } from 'date-fns'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { NextDepartureCard } from '@/components/dashboard/NextDepartureCard'
import { ReadinessCard } from '@/components/dashboard/ReadinessCard'
import { ChecklistPreview } from '@/components/dashboard/ChecklistPreview'
import { WeatherCard } from '@/components/dashboard/WeatherCard'
import { QuickActionCard } from '@/components/dashboard/QuickActionCard'
import { ScheduleList } from '@/components/events/ScheduleList'
import { Alert } from '@/components/common/Alert'
import { useAppState } from '@/hooks/useAppState'
import { useAuth } from '@/hooks/useAuth'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { mockWeather } from '@/data/weather'
import { getEventsOnDay, getNextEvent, getProgress } from '@/utils/events'

function greeting(date = new Date()) {
  const h = date.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardPage() {
  const { events, checklists, toggleItem } = useAppState()
  const { user, justRegistered, dismissWelcome } = useAuth()
  const loading = useSimulatedLoading(450)

  // The welcome banner is one-time: hide it after a few seconds.
  useEffect(() => {
    if (!justRegistered) return
    const id = setTimeout(dismissWelcome, 8000)
    return () => clearTimeout(id)
  }, [justRegistered, dismissWelcome])

  if (loading) return <LoadingSkeleton />

  const now = new Date()
  const nextEvent = getNextEvent(events, now)
  const todayEvents = getEventsOnDay(events, now)
  const items = nextEvent ? (checklists[nextEvent.id] ?? []) : []
  const progress = getProgress(items)

  return (
    <div className="space-y-6 lg:space-y-8">
      {justRegistered && <Alert variant="success">Your account has been created. Welcome to ReadySet!</Alert>}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-brand-600">{format(now, 'EEEE, MMMM d')}</p>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          {greeting(now)}, {user.name.split(' ')[0]}
        </h1>
        <p className="text-muted">Don&apos;t rush. Be ready. Here&apos;s what&apos;s coming up.</p>
      </div>

      <NextDepartureCard event={nextEvent} />

      <div className="grid gap-4 sm:grid-cols-3">
        <QuickActionCard to="/events/new" icon={CalendarPlus} title="Create event" description="Add something new" />
        <QuickActionCard to="/planner" icon={Compass} title="Plan departure" description="Work out when to leave" />
        <QuickActionCard to="/schedule" icon={CalendarDays} title="View schedule" description="See everything coming up" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Today&apos;s schedule</CardTitle>
                <CardDescription>
                  {todayEvents.length} {todayEvents.length === 1 ? 'event' : 'events'} today
                </CardDescription>
              </div>
              <ButtonLink to="/schedule" variant="ghost" size="sm">
                Full schedule
              </ButtonLink>
            </CardHeader>
            <CardContent>
              <ScheduleList events={todayEvents} emptyTitle="A clear day" emptyDescription="You have nothing scheduled today." />
            </CardContent>
          </Card>

          <ChecklistPreview
            eventTitle={nextEvent?.title}
            items={items}
            progress={progress}
            onToggle={(itemId) => toggleItem(nextEvent.id, itemId)}
          />
        </div>

        <div className="space-y-6">
          <ReadinessCard eventTitle={nextEvent?.title} done={progress.done} total={progress.total} percent={progress.percent} />
          <WeatherCard weather={mockWeather} />
        </div>
      </div>
    </div>
  )
}
