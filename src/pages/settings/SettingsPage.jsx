import { useState } from 'react'
import { Camera, Check, Globe, Monitor, Moon, Sun } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Alert } from '@/components/common/Alert'
import { FormInput } from '@/components/common/FormInput'
import { Avatar } from '@/components/layout/Avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NotificationPreferencesCard } from '@/components/settings/NotificationPreferencesCard'
import { EmailNotificationsCard } from '@/components/settings/EmailNotificationsCard'
import { EmailSecurityCard } from '@/components/settings/EmailSecurityCard'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'
import { ApiError, fieldErrorsFrom } from '@/lib/apiClient'
import { updatePreferencesRequest, updateProfileRequest } from '@/services/userApi'
import { TRAVEL_MODES } from '@/data/categories'
import { getInitials } from '@/utils/format'
import { cn } from '@/lib/utils'

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

function Section({ title, description, children }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  )
}

const isWholeNumber = (v) => v !== '' && Number.isInteger(Number(v))

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { user, refreshUser } = useAuth()
  const pref = user.preference

  // Profile + departure preferences are saved to the backend. Notification preferences live in NotificationPreferencesCard; theme is device-only.
  const [name, setName] = useState(user.name)
  const [prefs, setPrefs] = useState({
    defaultPreparationMinutes: String(pref?.defaultPreparationMinutes ?? 30),
    defaultArrivalBufferMinutes: String(pref?.defaultArrivalBufferMinutes ?? 10),
    preferredTravelMode: pref?.preferredTravelMode ?? 'manual',
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const touch = () => setSaved(false)

  const handleSave = async (e) => {
    e.preventDefault()
    setFormError('')
    const next = {}
    if (name.trim().length < 2) next.name = 'Enter at least 2 characters.'
    if (!isWholeNumber(prefs.defaultPreparationMinutes)) next.defaultPreparationMinutes = 'Enter a whole number.'
    if (!isWholeNumber(prefs.defaultArrivalBufferMinutes)) next.defaultArrivalBufferMinutes = 'Enter a whole number.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSaving(true)
    try {
      await updateProfileRequest({ name })
      await updatePreferencesRequest({
        defaultPreparationMinutes: Number(prefs.defaultPreparationMinutes),
        defaultArrivalBufferMinutes: Number(prefs.defaultArrivalBufferMinutes),
        preferredTravelMode: prefs.preferredTravelMode,
      })
      await refreshUser()
      setSaved(true)
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(fieldErrorsFrom(err))
        setFormError(err.message)
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
    <form onSubmit={handleSave} noValidate className="space-y-6">
      <PageHeader
        title="Settings"
        description="Tune ReadySet to the way you move."
        actions={
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : saved ? <><Check className="size-4" /> Saved</> : 'Save changes'}
          </Button>
        }
      />
      {formError && <Alert>{formError}</Alert>}

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Profile" description="How you appear in ReadySet.">
          <div className="flex items-center gap-4">
            <Avatar initials={getInitials(name)} className="size-16 text-xl" />
            <Button variant="outline" size="sm" disabled title="Avatar upload arrives in a later phase">
              <Camera className="size-4" /> Change photo
            </Button>
          </div>
          <FormInput label="Name" value={name} error={errors.name} onChange={(e) => { setName(e.target.value); touch() }} />
          <FormInput label="Email" type="email" value={user.email} readOnly hint="Changing your email is not available yet." />
        </Section>

        <Section title="Departure preferences" description="Defaults used when you create a new event.">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput label="Default preparation time" type="number" min="0" suffix="min" value={prefs.defaultPreparationMinutes} error={errors.defaultPreparationMinutes} onChange={(e) => { setPrefs({ ...prefs, defaultPreparationMinutes: e.target.value }); touch() }} />
            <FormInput label="Default arrival buffer" type="number" min="0" suffix="min" value={prefs.defaultArrivalBufferMinutes} error={errors.defaultArrivalBufferMinutes} onChange={(e) => { setPrefs({ ...prefs, defaultArrivalBufferMinutes: e.target.value }); touch() }} />
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Preferred travel mode</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {TRAVEL_MODES.map((m) => (
                <label
                  key={m.value}
                  className={cn(
                    'flex h-11 cursor-pointer items-center justify-center rounded-xl border px-2 text-sm font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500',
                    prefs.preferredTravelMode === m.value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line text-muted hover:border-brand-200',
                  )}
                >
                  <input type="radio" name="travelMode" value={m.value} checked={prefs.preferredTravelMode === m.value} onChange={() => { setPrefs({ ...prefs, preferredTravelMode: m.value }); touch() }} className="sr-only" />
                  {m.label}
                </label>
              ))}
            </div>
          </fieldset>
        </Section>

        <Section title="General" description="Appearance and region.">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Theme</legend>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map(({ value, label, icon: Icon }) => (
                <label
                  key={value}
                  className={cn(
                    'flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border text-xs font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500',
                    theme === value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line text-muted hover:border-brand-200',
                  )}
                >
                  <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => setTheme(value)} className="sr-only" />
                  <Icon className="size-5" />
                  {label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Your appearance updates instantly and is saved on this device.</p>
          </fieldset>
          <div className="flex items-center gap-3 rounded-xl bg-canvas p-4">
            <Globe className="size-5 text-brand-600" />
            <div>
              <p className="text-xs font-medium text-muted">Timezone</p>
              <p className="text-sm font-semibold">{pref?.timezone ?? 'Asia/Dhaka'}</p>
            </div>
          </div>
        </Section>
      </div>
    </form>

    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <EmailSecurityCard />
      <NotificationPreferencesCard />
      <EmailNotificationsCard />
    </div>
    </div>
  )
}
