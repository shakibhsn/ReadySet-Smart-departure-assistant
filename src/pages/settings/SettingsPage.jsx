import { useState } from 'react'
import { Camera, Check, Globe, Monitor, Moon, Sun } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Alert } from '@/components/common/Alert'
import { FormInput } from '@/components/common/FormInput'
import { Avatar } from '@/components/layout/Avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useAppState } from '@/hooks/useAppState'
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

const REMINDERS = [
  { key: 'preparation', title: 'Preparation reminder', desc: 'Alert me when it is time to start getting ready.' },
  { key: 'departure', title: 'Departure reminder', desc: 'Alert me when it is time to leave.' },
  { key: 'event', title: 'Event reminder', desc: 'Remind me shortly before an event starts.' },
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
  const { settings, updateSettings } = useAppState()
  const { user, refreshUser } = useAuth()
  const pref = user.preference

  // Profile + departure preferences are saved to the backend. Reminders and theme are still frontend-only.
  const [name, setName] = useState(user.name)
  const [prefs, setPrefs] = useState({
    defaultPreparationMinutes: String(pref?.defaultPreparationMinutes ?? 30),
    defaultArrivalBufferMinutes: String(pref?.defaultArrivalBufferMinutes ?? 10),
    preferredTravelMode: pref?.preferredTravelMode ?? 'manual',
  })
  const [local, setLocal] = useState({ reminders: settings.reminders, theme: settings.theme })
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
      updateSettings(local)
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

        <Section title="Notification preferences" description="Choose which reminders you want. Saved on this device only for now.">
          {REMINDERS.map(({ key, title, desc }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-sm text-muted">{desc}</p>
              </div>
              <Switch label={title} checked={local.reminders[key]} onCheckedChange={(v) => { setLocal({ ...local, reminders: { ...local.reminders, [key]: v } }); touch() }} />
            </div>
          ))}
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
                    local.theme === value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line text-muted hover:border-brand-200',
                  )}
                >
                  <input type="radio" name="theme" value={value} checked={local.theme === value} onChange={() => { setLocal({ ...local, theme: value }); touch() }} className="sr-only" />
                  <Icon className="size-5" />
                  {label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Theme switching is a preview only. Dark mode ships in a later phase.</p>
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
  )
}
