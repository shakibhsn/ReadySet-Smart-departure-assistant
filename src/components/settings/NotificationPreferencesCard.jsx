import { BellRing } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { FormSelect } from '@/components/common/FormSelect'
import { Skeleton } from '@/components/common/LoadingSkeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useNotifications } from '@/hooks/useNotifications'

const TYPES = [
  { key: 'upcoming', title: 'Upcoming event', desc: 'About an hour before an event starts.' },
  { key: 'prep', title: 'Preparation', desc: 'When it is almost time, and when it is time, to start getting ready.' },
  { key: 'departure', title: 'Departure', desc: 'When it is almost time, and when it is time, to leave.' },
  { key: 'checklist', title: 'Checklist', desc: 'If items are still unchecked shortly before you leave.' },
]
const LEADS = [5, 10, 15, 30].map((m) => ({ value: String(m), label: `${m} minutes before` }))

const BROWSER_TEXT = {
  unsupported: 'This browser does not support notifications. In-app notifications still work.',
  denied: 'Browser notifications are blocked for ReadySet. You can allow them in your browser’s site settings. In-app notifications continue to work.',
  default: 'Get a pop-up when a reminder is created. You will be asked for permission only after you click the button.',
  granted: 'Permission granted. Alerts appear only while ReadySet is open in a browser tab.',
}

export function NotificationPreferencesCard() {
  const { prefs, savePrefs, permission, enableBrowser, disableBrowser, actionError } = useNotifications()

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>In-app notifications</CardTitle>
          <CardDescription>Reminders created from your departure plan. Saved to your account.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {actionError && <Alert>{actionError}</Alert>}
        {!prefs ? (
          <div role="status" aria-label="Loading notification preferences" className="space-y-3">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Enable in-app notifications</p>
                <p className="text-sm text-muted">Turn everything below on or off.</p>
              </div>
              <Switch label="Enable in-app notifications" checked={prefs.enabled} onCheckedChange={(v) => savePrefs({ enabled: v })} />
            </div>
            <div className={prefs.enabled ? 'space-y-5' : 'pointer-events-none space-y-5 opacity-50'} aria-disabled={!prefs.enabled}>
              {TYPES.map(({ key, title, desc }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">{title} reminders</p>
                    <p className="text-sm text-muted">{desc}</p>
                  </div>
                  <Switch label={`${title} reminders`} checked={prefs[key]} onCheckedChange={(v) => savePrefs({ [key]: v })} />
                </div>
              ))}
              <FormSelect label="“Approaching” reminders" options={LEADS} value={String(prefs.leadMinutes)} onChange={(e) => savePrefs({ leadMinutes: Number(e.target.value) })} />
            </div>

            <div className="rounded-xl bg-canvas p-4">
              <p className="flex items-center gap-2 text-sm font-semibold"><BellRing className="size-4 text-brand-600" /> Browser notifications (optional)</p>
              <p className="mt-1 text-sm text-muted">{BROWSER_TEXT[permission] ?? BROWSER_TEXT.default}</p>
              <div className="mt-3">
                {permission === 'default' && <Button size="sm" onClick={enableBrowser}>Enable browser notifications</Button>}
                {permission === 'granted' && (
                  <div className="flex items-center gap-3">
                    <Switch label="Browser notifications" checked={prefs.browser} onCheckedChange={(v) => (v ? savePrefs({ browser: true }) : disableBrowser())} />
                    <span className="text-sm text-muted">{prefs.browser ? 'On' : 'Off'}</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
