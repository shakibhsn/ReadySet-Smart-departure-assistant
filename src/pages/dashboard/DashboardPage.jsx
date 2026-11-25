import { useEffect } from 'react'
import { CalendarPlus, Compass, ListTodo } from 'lucide-react'
import { format } from 'date-fns'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert } from '@/components/common/Alert'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { NextDepartureCard } from '@/components/dashboard/NextDepartureCard'
import { ReadinessCard } from '@/components/dashboard/ReadinessCard'
import { ChecklistPreview } from '@/components/dashboard/ChecklistPreview'
import { WeatherCard } from '@/components/weather/WeatherCard'
import { LocationWeatherCard } from '@/components/weather/LocationWeatherCard'
import { AssistantEntryCard } from '@/components/dashboard/AssistantEntryCard'
import { DashboardCalendar } from '@/components/dashboard/DashboardCalendar'
import { ExplorePreviewCard } from '@/components/dashboard/ExplorePreviewCard'
import { SavedPlacesCard } from '@/components/dashboard/SavedPlacesCard'
import { TravelWeatherReminder } from '@/components/dashboard/TravelWeatherReminder'
import { ConflictsCard } from '@/components/events/ConflictsCard'
import { ScheduleList } from '@/components/events/ScheduleList'
import { useChecklist } from '@/hooks/useChecklist'
import { useAuth } from '@/hooks/useAuth'
import { useEventQuery } from '@/hooks/useEventQuery'
import { useForecast } from '@/hooks/useForecast'
import { useWeatherLocation } from '@/hooks/useWeatherLocation'
import { getUpcomingPlans } from '@/services/departureApi'
import { getEvents, getOccurrences, getUpcomingEvents } from '@/services/eventApi'
import { todayKey } from '@/utils/format'

function greeting(date = new Date()) {
  const h = date.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardPage() {
  const { user, justRegistered, dismissWelcome } = useAuth()
  const { location: weatherLocation } = useWeatherLocation()
  const forecast = useForecast(weatherLocation) // one request, shared by the weather card and the departure reminder
  const timezone = user.preference?.timezone ?? 'Asia/Dhaka'
  const today = todayKey(timezone)

  // The welcome banner is one-time: hide it after a few seconds.
  useEffect(() => {
    if (!justRegistered) return
    const id = setTimeout(dismissWelcome, 8000)
    return () => clearTimeout(id)
  }, [justRegistered, dismissWelcome])

  // Real data from the API. "Today" is the user's own calendar day (their saved timezone).
  const upcoming = useEventQuery(() => getUpcomingEvents({ limit: 6 }), [])
  const todays = useEventQuery(() => getOccurrences({ from: today, to: today, timezone }), [today, timezone])
  const count = useEventQuery(() => getEvents({ limit: 1 }), [])
  // The Next Departure card shows the plan calculated by the backend departure engine (sorted by departure time).
  const plans = useEventQuery(() => getUpcomingPlans({ days: 14, limit: 3 }), [])

  const queries = [upcoming, todays, count, plans]
  const failed = queries.find((q) => q.error)
  const initialLoad = queries.some((q) => q.loading && !q.data)

  const now = new Date()
  const upcomingEvents = upcoming.data ?? []
  const nextPlan = plans.data?.plans[0] ?? null
  const nextEvent = nextPlan?.event ?? null // checklist / readiness cards follow the same event
  const total = count.data?.pagination.total ?? 0
  const checklist = useChecklist(nextEvent?.id ?? null) // database-backed, for the same event as the Next Departure card
  const { items, progress } = checklist

  return (
    <div className="space-y-6 lg:space-y-8">
      {justRegistered && <Alert variant="success">Your account has been created. Welcome to ReadySet!</Alert>}

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-brand-600">{format(now, 'EEEE, MMMM d')}</p>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            {greeting(now)}, {user.name.split(' ')[0]}
          </h1>
          <p className="text-muted">
            Don&apos;t rush. Be ready.{' '}
            {!initialLoad && !failed && (total === 0 ? 'Add your first event to get started.' : `You have ${total} ${total === 1 ? 'event' : 'events'} scheduled.`)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Quick actions" role="group">
          <ButtonLink to="/events/new" variant="lime" size="sm"><CalendarPlus className="size-4" /> New event</ButtonLink>
          <ButtonLink to="/planner" variant="outline" size="sm"><Compass className="size-4" /> Plan departure</ButtonLink>
          <ButtonLink to="/schedule" variant="outline" size="sm"><ListTodo className="size-4" /> Schedule</ButtonLink>
        </div>
      </header>

      {failed ? (
        <Alert>
          {failed.error.message}{' '}
          <button type="button" onClick={() => queries.forEach((q) => q.reload())} className="font-bold underline">Try again</button>
        </Alert>
      ) : initialLoad ? (
        <LoadingSkeleton />
      ) : (
        <>
          <ConflictsCard compact />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            {/* Main column: what to do next */}
            <div className="anim-fade-up min-w-0 space-y-6 xl:col-span-8">
              <NextDepartureCard plan={nextPlan} onRefresh={plans.reload} />
              <TravelWeatherReminder location={weatherLocation} forecast={forecast.data} plan={nextPlan} />

              <div className={upcomingEvents.length > 0 ? 'grid items-start gap-6 md:grid-cols-2' : ''}>
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Today&apos;s schedule</CardTitle>
                      <CardDescription>
                        {todays.data.length} {todays.data.length === 1 ? 'event' : 'events'} today
                      </CardDescription>
                    </div>
                    <ButtonLink to="/schedule" variant="ghost" size="sm">
                      Full schedule
                    </ButtonLink>
                  </CardHeader>
                  <CardContent>
                    <ScheduleList
                      events={todays.data}
                      emptyTitle={total === 0 ? 'No events yet' : 'A clear day'}
                      emptyDescription={total === 0 ? 'Create your first event to see it here.' : 'You have nothing scheduled today.'}
                    />
                  </CardContent>
                </Card>

                {upcomingEvents.length > 0 && (
                  <Card>
                    <CardHeader>
                      <div>
                        <CardTitle>Upcoming events</CardTitle>
                        <CardDescription>What&apos;s coming next</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ScheduleList events={upcomingEvents.slice(0, 4)} showDay />
                    </CardContent>
                  </Card>
                )}
              </div>

              <ChecklistPreview eventTitle={nextEvent?.title} items={items} progress={progress} onToggle={checklist.toggle} loading={checklist.loading} />
              <DashboardCalendar />
            </div>

            {/* Side column: context and shortcuts */}
            <aside aria-label="Weather, assistant and places" className="anim-fade-up min-w-0 space-y-6 xl:col-span-4" style={{ '--d': '90ms' }}>
              <LocationWeatherCard location={weatherLocation} query={forecast} compact />
              <AssistantEntryCard />
              <ReadinessCard eventTitle={nextEvent?.title} done={progress.done} total={progress.total} percent={progress.percent} />
              <ExplorePreviewCard location={weatherLocation} />
              <SavedPlacesCard />
              {nextEvent && <WeatherCard event={nextEvent} />}
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
