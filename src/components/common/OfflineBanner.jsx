import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { useOffline } from '@/hooks/useOffline'

/** Says plainly what works offline and what does not. Never implies the whole app works without a connection. */
export function OfflineBanner() {
  const { online, pending, conflicts, snapshotAt, syncing, dismissConflicts } = useOffline()
  return (
    <>
      {!online && (
        <div role="status" className="flex items-start gap-2.5 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <CloudOff className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong>You are offline.</strong> You can read the upcoming events and checklists saved on this device{snapshotAt ? ` (updated ${new Date(snapshotAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})` : ''} and tick checklist items; ticks sync when you reconnect.
            Creating or editing events, weather, notifications, settings and the assistant need a connection.
            {pending > 0 && ` ${pending} ${pending === 1 ? 'change is' : 'changes are'} waiting to sync.`}
          </p>
        </div>
      )}
      {online && (pending > 0 || syncing) && (
        <div role="status" className="flex items-center gap-2.5 border-b border-brand-200 bg-brand-50 px-4 py-2 text-sm text-brand-800">
          <RefreshCw className="size-4 shrink-0 animate-spin" />
          <p>Syncing {pending} offline {pending === 1 ? 'change' : 'changes'}…</p>
        </div>
      )}
      {conflicts.length > 0 && (
        <div role="alert" className="flex items-start gap-2.5 border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Some offline changes were not applied</p>
            <ul className="list-disc pl-5">{[...new Set(conflicts.map((c) => c.message))].map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
          <button type="button" onClick={dismissConflicts} className="shrink-0 cursor-pointer font-bold underline">Dismiss</button>
        </div>
      )}
    </>
  )
}
