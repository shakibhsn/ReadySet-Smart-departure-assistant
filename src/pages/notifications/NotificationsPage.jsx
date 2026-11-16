import { useState } from 'react'
import { BellOff, CheckCheck } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { SegmentedControl } from '@/components/common/SegmentedControl'
import { EmptyState } from '@/components/common/EmptyState'
import { NotificationCard } from '@/components/notifications/NotificationCard'
import { Button } from '@/components/ui/button'
import { useAppState } from '@/hooks/useAppState'
import { NOTIFICATION_CATEGORIES } from '@/data/notifications'
import { cn } from '@/lib/utils'

export default function NotificationsPage() {
  const { notifications, markRead, markAllRead } = useAppState()
  const [tab, setTab] = useState('all')
  const [category, setCategory] = useState('all')

  const unread = notifications.filter((n) => !n.read).length
  const tabs = [
    { value: 'all', label: `All (${notifications.length})` },
    { value: 'unread', label: `Unread (${unread})` },
    { value: 'read', label: `Read (${notifications.length - unread})` },
  ]

  const visible = notifications
    .filter((n) => tab === 'all' || (tab === 'unread' ? !n.read : n.read))
    .filter((n) => category === 'all' || n.category === category)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description={unread ? `You have ${unread} unread ${unread === 1 ? 'notification' : 'notifications'}.` : "You're all caught up."}
        actions={
          <Button variant="outline" onClick={markAllRead} disabled={unread === 0}>
            <CheckCheck className="size-4" /> Mark all as read
          </Button>
        }
      />

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

      {visible.length === 0 ? (
        <EmptyState icon={BellOff} title="Nothing here" description="No notifications match this filter." />
      ) : (
        <ul className="space-y-3">
          {visible.map((n) => (
            <NotificationCard key={n.id} notification={n} onMarkRead={markRead} />
          ))}
        </ul>
      )}
    </div>
  )
}
