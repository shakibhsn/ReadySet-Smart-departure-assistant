import { useState } from 'react'
import { BellOff, CheckCheck } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { PageHeader } from '@/components/common/PageHeader'
import { SegmentedControl } from '@/components/common/SegmentedControl'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { NotificationCard } from '@/components/notifications/NotificationCard'
import { Button, ButtonLink } from '@/components/ui/button'
import { useNotifications } from '@/hooks/useNotifications'
import { NOTIFICATION_CATEGORIES } from '@/data/notifications'
import { cn } from '@/lib/utils'

export default function NotificationsPage() {
  const { items, unreadCount, loaded, error, hasMore, actionError, refresh, loadMore, markRead, markAllRead, remove } = useNotifications()
  const [tab, setTab] = useState('all')
  const [category, setCategory] = useState('all')

  if (!loaded) return <LoadingSkeleton cards={2} />
  if (error && items.length === 0) {
    return (
      <Alert>
        {error.message}{' '}
        <button type="button" onClick={refresh} className="font-bold underline">Try again</button>
      </Alert>
    )
  }

  const tabs = [
    { value: 'all', label: `All (${items.length})` },
    { value: 'unread', label: `Unread (${unreadCount})` },
    { value: 'read', label: `Read (${items.filter((n) => n.read).length})` },
  ]
  const visible = items
    .filter((n) => tab === 'all' || (tab === 'unread' ? !n.read : n.read))
    .filter((n) => category === 'all' || n.category === category)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description={unreadCount ? `You have ${unreadCount} unread ${unreadCount === 1 ? 'notification' : 'notifications'}.` : "You're all caught up."}
        actions={
          <>
            <ButtonLink to="/settings" variant="ghost">Notification settings</ButtonLink>
            <Button variant="outline" onClick={markAllRead} disabled={unreadCount === 0}>
              <CheckCheck className="size-4" /> Mark all as read
            </Button>
          </>
        }
      />
      {actionError && <Alert>{actionError}</Alert>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-full overflow-x-auto">
          <SegmentedControl label="Filter by status" options={tabs} value={tab} onChange={setTab} />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {[{ value: 'all', label: 'All types' }, ...NOTIFICATION_CATEGORIES].map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              aria-pressed={category === c.value}
              className={cn(
                'h-9 cursor-pointer rounded-full border px-3.5 text-xs font-semibold transition-colors',
                category === c.value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-surface text-muted hover:border-brand-200',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={BellOff} title="No notifications yet" description="Reminders for preparing, leaving and upcoming events appear here at the right time." />
      ) : visible.length === 0 ? (
        <EmptyState icon={BellOff} title="Nothing here" description="No notifications match this filter." />
      ) : (
        <ul className="space-y-3">
          {visible.map((n) => (
            <NotificationCard key={n.id} notification={n} onMarkRead={markRead} onDelete={remove} />
          ))}
        </ul>
      )}
      {hasMore && (
        <div className="text-center">
          <Button variant="outline" onClick={loadMore}>Load older notifications</Button>
        </div>
      )}
    </div>
  )
}
