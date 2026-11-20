import { CalendarClock, MapPin, TriangleAlert } from 'lucide-react'
import { CategoryBadge } from '@/components/common/CategoryBadge'
import { EmptyState } from '@/components/common/EmptyState'
import { Countdown } from '@/components/planner/Countdown'
import { StatusBadge } from '@/components/planner/StatusBadge'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useLiveReadiness } from '@/hooks/useLiveReadiness'
import { formatDayLabel } from '@/utils/format'

/**
 * Next departure, from a backend departure plan. The countdown and status advance locally from the
 * plan's timestamps (one 1-second timer, paused in hidden tabs); the plan is refetched only when its
 * status changes, and by the Dashboard when event data changes.
 */
export function NextDepartureCard({ plan, onRefresh }) {
  const { live, now, stale } = useLiveReadiness(plan, onRefresh)

  if (!plan) {
    return (
      <Card>
        <EmptyState
          icon={CalendarClock}
          title="No upcoming departures"
          description="Create an event to see when you should leave."
          action={
            <ButtonLink to="/events/new" size="sm">
              Create event
            </ButtonLink>
          }
        />
      </Card>
    )
  }

  const { event, local } = plan
  const status = live.status
  const milestone = live.nextMilestone
  const started = status === 'EVENT_STARTED'
  const lateMinutes = Math.max(0, Math.floor((now - new Date(plan.plan.departureTime)) / 60_000))
  const warning =
    status === 'READY_TO_LEAVE' && lateMinutes >= 1
      ? `You are ${lateMinutes} min past your departure time.`
      : status === 'ARRIVAL_TARGET_PASSED'
        ? 'Your target arrival time has passed.'
        : started
          ? 'This event has already started.'
          : null

  const planLink = `/planner?event=${event.id}${event.isRecurring ? `&occurrence=${encodeURIComponent(event.startAt)}` : ''}`

  return (
    <section aria-label="Next departure" className="hero-scope relative overflow-hidden rounded-2xl bg-hero-gradient text-white shadow-lift ring-1 ring-white/10">
      <div aria-hidden="true" className="absolute -right-16 -top-20 size-72 rounded-full bg-brand-400/25 blur-2xl" />
      <div aria-hidden="true" className="absolute -bottom-28 right-20 size-60 rounded-full bg-accent-400/20 blur-2xl" />
      <div aria-hidden="true" className="absolute left-0 top-0 h-1 w-24 rounded-br-full bg-amber-400" />

      <div className="relative grid grid-cols-1 gap-6 p-5 sm:p-7 lg:grid-cols-[1.2fr_1fr] lg:gap-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-accent-200">Next departure</p>
            <StatusBadge status={status} onDark />
          </div>
          <h2 className="mt-2 break-words text-2xl font-extrabold tracking-tight sm:text-3xl">{event.title}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-brand-100">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-4" /> {formatDayLabel(local.eventStart.date)} at {local.eventStart.time12}
            </span>
            {event.destination && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <MapPin className="size-4 shrink-0" /> <span className="truncate">{event.destination}</span>
              </span>
            )}
          </div>
          {event.category && (
            <div className="mt-3 [&_span]:ring-white/20">
              <CategoryBadge category={event.category} />
            </div>
          )}

          <dl className="mt-6 grid grid-cols-3 gap-3">
            {[
              { label: 'Start preparing', value: local.preparationStart.time12 },
              { label: 'Leave at', value: local.departureTime.time12, strong: true },
              { label: 'Target arrival', value: local.targetArrival.time12 },
            ].map(({ label, value, strong }) => (
              <div key={label} className={`rounded-xl px-3 py-3 ${strong ? 'bg-surface text-ink' : 'bg-white/10'}`}>
                <dt className={`text-[11px] font-semibold uppercase tracking-wide ${strong ? 'text-brand-600' : 'text-brand-200'}`}>{label}</dt>
                <dd className="mt-1 text-base font-extrabold sm:text-lg">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col justify-between gap-5 rounded-2xl bg-white/5 p-5">
          <div>
            {milestone ? (
              <>
                <p className="text-sm font-semibold text-brand-100">{milestone.label} in</p>
                <div className="mt-3">
                  <Countdown seconds={milestone.secondsUntil} label={`Countdown: ${milestone.label}`} onDark />
                </div>
              </>
            ) : (
              <p className="text-sm font-semibold text-brand-100">This event has started.</p>
            )}
          </div>

          {warning && (
            <p role="alert" className="flex gap-2 rounded-xl bg-amber-400/20 px-3 py-2 text-sm font-semibold text-amber-100">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {warning}
            </p>
          )}
          <p className="text-sm text-brand-200">{plan.explanation}</p>

          <ButtonLink to={planLink} variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white">
            View Departure Plan
          </ButtonLink>
          {stale && <span className="sr-only">Updating plan…</span>}
        </div>
      </div>
    </section>
  )
}
