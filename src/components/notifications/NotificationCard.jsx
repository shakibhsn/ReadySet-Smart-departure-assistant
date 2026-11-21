import { Link } from 'react-router-dom'
import { AlarmClock, AlarmClockOff, CalendarDays, Check, Info, Route, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NOTIFICATION_CATEGORIES } from '@/data/notifications'
import { formatRelative } from '@/utils/format'
import { cn } from '@/lib/utils'

const ICONS = {
  departure: { icon: Route, tone: 'bg-brand-50 text-brand-600' },
  preparation: { icon: AlarmClock, tone: 'bg-accent-50 text-accent-600' },
  event: { icon: CalendarDays, tone: 'bg-sky-50 text-sky-600' },
  system: { icon: Info, tone: 'bg-slate-100 text-slate-500' },
}

const PRIORITY = { urgent: 'bg-rose-50 text-rose-700 ring-rose-200', high: 'bg-amber-50 text-amber-700 ring-amber-200' }
const SNOOZE_OPTIONS = [{ value: '10m', label: '10 minutes' }, { value: '1h', label: '1 hour' }, { value: 'until_event', label: 'Until the event' }]

export function NotificationCard({ notification, onMarkRead, onDelete, onSnooze, onUnsnooze }) {
  const { icon: Icon, tone } = ICONS[notification.category] ?? ICONS.system
  const label = NOTIFICATION_CATEGORIES.find((c) => c.value === notification.category)?.label

  return (
    <li
      className={cn(
        'flex gap-4 rounded-2xl border p-4 transition-colors',
        notification.read ? 'border-line bg-surface' : 'border-brand-200 bg-brand-50/50',
      )}
    >
      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', tone)}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-sm font-bold text-ink">{notification.title}</h3>
          {!notification.read && !notification.snoozedUntil && <span className="size-2 rounded-full bg-accent-500" aria-label="Unread" />}
          {PRIORITY[notification.priority] && <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset', PRIORITY[notification.priority])}>{notification.priority}</span>}
          {notification.snoozedUntil && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">Snoozed until {new Date(notification.snoozedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
        </div>
        <p className="mt-0.5 text-sm text-muted">{notification.body}</p>
        <p className="mt-2 text-xs text-muted">
          {label} · {formatRelative(notification.createdAt)}
          {notification.eventId && (
            <>
              {' · '}
              <Link to={`/events/${notification.eventId}`} className="font-semibold text-brand-700 hover:underline">View event</Link>
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-start gap-1 self-start">
        {!notification.read && !notification.snoozedUntil && onSnooze && (
          <select
            aria-label={`Snooze "${notification.title}"`}
            value=""
            onChange={(e) => e.target.value && onSnooze(notification.id, e.target.value)}
            className="h-9 cursor-pointer rounded-lg border border-line bg-surface px-2 text-xs font-semibold text-muted hover:border-brand-200"
          >
            <option value="">Snooze…</option>
            {SNOOZE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        {notification.snoozedUntil && onUnsnooze && (
          <Button variant="ghost" size="sm" onClick={() => onUnsnooze(notification.id)} aria-label={`Cancel snooze for "${notification.title}"`}>
            <AlarmClockOff className="size-4" />
            <span className="hidden sm:inline">Cancel snooze</span>
          </Button>
        )}
        {!notification.read && (
          <Button variant="ghost" size="sm" onClick={() => onMarkRead(notification.id)} aria-label={`Mark "${notification.title}" as read`}>
            <Check className="size-4" />
            <span className="hidden sm:inline">Mark read</span>
          </Button>
        )}
        {onDelete && (
          <Button variant="ghost" size="sm" onClick={() => onDelete(notification.id)} aria-label={`Delete "${notification.title}"`} className="hover:bg-rose-50 hover:text-rose-600">
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </li>
  )
}
