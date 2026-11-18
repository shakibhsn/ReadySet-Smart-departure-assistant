import { splitSeconds } from '@/utils/departureStatus'
import { cn } from '@/lib/utils'

function Unit({ value, label, onDark }) {
  return (
    <div className={cn('flex min-w-16 flex-col items-center rounded-xl px-3 py-2.5', onDark ? 'bg-white/10' : 'bg-brand-50')}>
      <span className="text-2xl font-extrabold tabular-nums sm:text-3xl">{String(value).padStart(2, '0')}</span>
      <span className={cn('text-[11px] font-semibold uppercase tracking-wide', onDark ? 'text-brand-200' : 'text-muted')}>{label}</span>
    </div>
  )
}

/** Remaining time as tiles. `seconds` comes from timestamps (never negative); days appear only when needed. */
export function Countdown({ seconds, label, onDark = false }) {
  const { days, hours, minutes, seconds: secs } = splitSeconds(seconds)
  return (
    <div className="flex flex-wrap gap-2" role="timer" aria-label={label}>
      {days > 0 ? (
        <>
          <Unit value={days} label="days" onDark={onDark} />
          <Unit value={hours} label="hrs" onDark={onDark} />
          <Unit value={minutes} label="min" onDark={onDark} />
        </>
      ) : (
        <>
          <Unit value={hours} label="hrs" onDark={onDark} />
          <Unit value={minutes} label="min" onDark={onDark} />
          <Unit value={secs} label="sec" onDark={onDark} />
        </>
      )}
    </div>
  )
}
