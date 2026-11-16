import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { Skeleton } from '@/components/common/LoadingSkeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { getEmailPreferencesRequest, updateEmailPreferencesRequest } from '@/services/userApi'

const OPTIONS = [
  { key: 'upcomingEventReminders', title: 'Upcoming event reminders', desc: 'An email about an hour before an event starts.' },
  { key: 'prepStartReminders', title: 'Preparation reminders', desc: 'An email when it is time to start getting ready.' },
  { key: 'departureReminders', title: 'Departure reminders', desc: 'An email when it is time to leave.' },
]

const REQUIRED = ['Security alerts (password or email changes)', 'Email verification', 'Password reset links']

export function EmailNotificationsCard() {
  const [prefs, setPrefs] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    getEmailPreferencesRequest()
      .then((p) => !cancelled && (setPrefs(p), setError('')))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [attempt])

  const toggle = async (key, value) => {
    const previous = prefs
    setPrefs({ ...prefs, [key]: value }) // optimistic
    setSaving(key)
    setError('')
    try {
      setPrefs(await updateEmailPreferencesRequest({ [key]: value }))
    } catch (err) {
      setPrefs(previous) // revert: the server did not accept it
      setError(err.message)
    } finally {
      setSaving('')
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Email notifications</CardTitle>
          <CardDescription>Choose which reminders ReadySet emails you. Reminders go to verified addresses only.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <Alert>
            {error}{' '}
            {!prefs && (
              <button type="button" onClick={() => setAttempt((a) => a + 1)} className="font-bold underline">
                Try again
              </button>
            )}
          </Alert>
        )}
        {!prefs && !error && (
          <div role="status" aria-label="Loading email preferences" className="space-y-3">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        )}
        {prefs && (
          <>
            {OPTIONS.map(({ key, title, desc }) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-sm text-muted">{desc}</p>
                </div>
                <Switch label={title} checked={prefs[key]} onCheckedChange={(v) => toggle(key, v)} className={saving === key ? 'opacity-60' : ''} />
              </div>
            ))}
            <div className="rounded-xl bg-canvas p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Lock className="size-4 text-muted" /> Always on
              </p>
              <ul className="mt-2 list-inside list-disc text-sm text-muted">
                {REQUIRED.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">These keep your account safe and cannot be turned off.</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
