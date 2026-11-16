import { AlarmClock, CalendarDays, Check, Info, Route } from 'lucide-react'
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

export function NotificationCard({ notification, onMarkRead }) {
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
          {!notification.read && <span className="size-2 rounded-full bg-accent-500" aria-label="Unread" />}
        </div>
        <p className="mt-0.5 text-sm text-muted">{notification.body}</p>
        <p className="mt-2 text-xs text-muted">
          {label} · {formatRelative(notification.createdAt)}
        </p>
      </div>
      {!notification.read && (
        <Button variant="ghost" size="sm" onClick={() => onMarkRead(notification.id)} aria-label={`Mark "${notification.title}" as read`} className="self-start">
          <Check className="size-4" />
          <span className="hidden sm:inline">Mark read</span>
        </Button>
      )}
    </li>
  )
}
