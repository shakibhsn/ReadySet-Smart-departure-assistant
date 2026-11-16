import { useState } from 'react'
import { BadgeCheck, MailWarning } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { FormInput } from '@/components/common/FormInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'
import { ApiError, fieldErrorsFrom } from '@/lib/apiClient'
import { resendVerificationRequest } from '@/services/authApi'
import { requestEmailChangeRequest } from '@/services/userApi'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function EmailSecurityCard() {
  const { user } = useAuth()
  const [resendState, setResendState] = useState('idle') // idle | sending | sent
  const [form, setForm] = useState({ newEmail: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [requested, setRequested] = useState(false)

  const resend = async () => {
    setResendState('sending')
    await resendVerificationRequest(user.email).catch(() => {})
    setResendState('sent')
  }

  const handleChange = async (e) => {
    e.preventDefault()
    const next = {}
    if (!EMAIL_RE.test(form.newEmail)) next.newEmail = 'Enter a valid email address.'
    if (!form.password) next.password = 'Enter your current password to confirm.'
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    try {
      await requestEmailChangeRequest(form.newEmail.trim(), form.password)
      setRequested(true)
      setForm({ newEmail: '', password: '' })
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(fieldErrorsFrom(err))
        setFormError(err.status === 400 ? 'Please fix the highlighted fields.' : err.message)
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Email &amp; security</CardTitle>
          <CardDescription>Your sign-in address and how we verify it.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-3 rounded-xl bg-canvas p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.email}</p>
            {user.emailVerified ? (
              <Badge className="mt-1.5 bg-accent-50 text-accent-700 ring-accent-200">
                <BadgeCheck className="size-3.5" /> Verified
              </Badge>
            ) : (
              <Badge className="mt-1.5 bg-amber-50 text-amber-700 ring-amber-200">
                <MailWarning className="size-3.5" /> Not verified
              </Badge>
            )}
          </div>
          {!user.emailVerified &&
            (resendState === 'sent' ? (
              <p role="status" className="text-sm font-medium text-accent-700">If it still needs verification, a new link is on its way.</p>
            ) : (
              <Button variant="outline" size="sm" onClick={resend} disabled={resendState === 'sending'}>
                {resendState === 'sending' ? 'Sending…' : 'Resend verification email'}
              </Button>
            ))}
        </div>

        <form onSubmit={handleChange} noValidate className="space-y-4" aria-label="Change email address">
          <div>
            <h3 className="text-sm font-bold">Change email address</h3>
            <p className="text-sm text-muted">We&apos;ll send a confirmation link to the new address. Nothing changes until you open it.</p>
          </div>
          {formError && <Alert>{formError}</Alert>}
          {requested && <Alert variant="success">If that address can be used, a confirmation link is on its way. Your email has not changed yet.</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput label="New email address" type="email" autoComplete="email" value={form.newEmail} error={errors.newEmail} onChange={(e) => { setForm({ ...form, newEmail: e.target.value }); setRequested(false) }} />
            <FormInput label="Current password" type="password" autoComplete="current-password" value={form.password} error={errors.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <Button type="submit" variant="outline" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send confirmation link'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
