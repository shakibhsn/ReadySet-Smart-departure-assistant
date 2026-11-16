import { CalendarClock, MapPin } from 'lucide-react'
import { CategoryBadge } from '@/components/common/CategoryBadge'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/common/EmptyState'
import { useNow } from '@/hooks/useNow'
import { formatClock, getCountdown, getEventDeparture } from '@/utils/departure'
import { formatDayLabel, formatDuration, formatTime12 } from '@/utils/format'

function CountdownUnit({ value, label }) {
  return (
    <div className="flex min-w-16 flex-col items-center rounded-xl bg-white/10 px-3 py-2.5">
      <span className="text-2xl font-extrabold tabular-nums sm:text-3xl">{String(value).padStart(2, '0')}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-200">{label}</span>
    </div>
  )
}

export function NextDepartureCard({ event }) {
  const now = useNow(1000)

  if (!event) {
    return (
      <Card>
        <EmptyState icon={CalendarClock} title="No upcoming departures" description="Create an event to see when you should leave." />
      </Card>
    )
  }

  const plan = getEventDeparture(event)
  const untilDeparture = getCountdown(plan.departure, now)
  const untilPrep = getCountdown(plan.prepStart, now)
  const prepStarted = untilPrep.isPast && !untilDeparture.isPast
  const countdown = untilDeparture
  const hoursTotal = countdown.days * 24 + countdown.hours

  return (
    <section aria-label="Next departure" className="relative overflow-hidden rounded-2xl bg-brand-800 text-white shadow-lift">
      <div aria-hidden="true" className="absolute -right-16 -top-16 size-64 rounded-full bg-brand-600/40" />
      <div aria-hidden="true" className="absolute -bottom-24 right-24 size-56 rounded-full bg-accent-600/15" />

      <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.2fr_1fr] lg:gap-8">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-accent-200">Next departure</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{event.title}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-brand-100">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-4" /> {formatDayLabel(event.date)} at {formatTime12(event.startTime)}
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MapPin className="size-4 shrink-0" /> <span className="truncate">{event.destination}</span>
            </span>
          </div>
          <div className="mt-3 [&_span]:ring-white/20">
            <CategoryBadge category={event.category} />
          </div>

          <dl className="mt-6 grid grid-cols-3 gap-3">
            {[
              { label: 'Start preparing', value: formatClock(plan.prepStart) },
              { label: 'Leave at', value: formatClock(plan.departure), strong: true },
              { label: 'Travel time', value: formatDuration(event.travelMinutes) },
            ].map(({ label, value, strong }) => (
              <div key={label} className={`rounded-xl px-3 py-3 ${strong ? 'bg-white text-ink' : 'bg-white/10'}`}>
                <dt className={`text-[11px] font-semibold uppercase tracking-wide ${strong ? 'text-brand-600' : 'text-brand-200'}`}>{label}</dt>
                <dd className="mt-1 text-base font-extrabold sm:text-lg">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col justify-between gap-5 rounded-2xl bg-white/5 p-5">
          <div>
            <p className="text-sm font-semibold text-brand-100">
              {untilDeparture.isPast ? 'Departure time has passed' : prepStarted ? 'Time to leave in' : 'Leave in'}
            </p>
            {!untilDeparture.isPast && (
              <div className="mt-3 flex flex-wrap gap-2" role="timer" aria-label="Countdown to departure">
                {countdown.days > 0 ? (
                  <>
                    <CountdownUnit value={countdown.days} label="days" />
                    <CountdownUnit value={countdown.hours} label="hrs" />
                    <CountdownUnit value={countdown.minutes} label="min" />
                  </>
                ) : (
                  <>
                    <CountdownUnit value={hoursTotal} label="hrs" />
                    <CountdownUnit value={countdown.minutes} label="min" />
                    <CountdownUnit value={countdown.seconds} label="sec" />
                  </>
                )}
              </div>
            )}
          </div>
          <p className="text-sm text-brand-200">
            {untilDeparture.isPast
              ? 'This event may already be underway.'
              : prepStarted
                ? 'Preparation window is open. Start getting ready now.'
                : `Start preparing at ${formatClock(plan.prepStart)}.`}
          </p>
          <ButtonLink to="/planner" variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white">
            Open departure planner
          </ButtonLink>
        </div>
      </div>
    </section>
  )
}
