import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { useNotifications } from '@/hooks/useNotifications'
import { formatRelative } from '@/utils/format'
import { cn } from '@/lib/utils'

/** Navbar bell: unread badge + a small panel with the latest notifications. */
export function NotificationBell() {
  const { items, unreadCount, loaded, error, markRead, markAllRead, refresh } = useNotifications()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onClick = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const latest = items.slice(0, 5)
  const open_ = (n) => {
    if (!n.read) markRead(n.id)
    setOpen(false)
    if (n.eventId) navigate(`/events/${n.eventId}`)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); if (!open) refresh() }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        className="relative flex size-11 cursor-pointer items-center justify-center rounded-xl text-muted hover:bg-brand-50 hover:text-brand-700"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span aria-hidden="true" className="absolute right-1 top-1 flex min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-[11px] font-bold leading-5 text-white ring-2 ring-surface">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface shadow-lift">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <p className="text-sm font-bold">Notifications</p>
            <button type="button" onClick={markAllRead} disabled={unreadCount === 0} className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-brand-700 disabled:cursor-default disabled:opacity-40">
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          </div>
          {!loaded ? (
            <p role="status" className="px-4 py-6 text-center text-sm text-muted">Loading…</p>
          ) : error && latest.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">Could not load notifications. <button type="button" onClick={refresh} className="font-bold text-brand-700 underline">Try again</button></p>
          ) : latest.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">You&apos;re all caught up.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto p-1.5">
              {latest.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => open_(n)} className={cn('flex w-full cursor-pointer gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-brand-50', !n.read && 'bg-brand-50/60')}>
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-accent-500')} aria-label={n.read ? undefined : 'Unread'} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{n.title}</span>
                      <span className="line-clamp-2 text-xs text-muted">{n.body}</span>
                      <span className="mt-0.5 block text-[11px] text-muted">{formatRelative(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line p-2 text-center">
            <Link to="/notifications" onClick={() => setOpen(false)} className="text-sm font-semibold text-brand-700 hover:underline">View all notifications</Link>
          </div>
        </div>
      )}
    </div>
  )
}
