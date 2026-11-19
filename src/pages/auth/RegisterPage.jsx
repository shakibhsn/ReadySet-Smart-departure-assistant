import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Lock, Mail, MailCheck, User } from 'lucide-react'
import AuthLayout from '@/layouts/AuthLayout'
import { Alert } from '@/components/common/Alert'
import { FormInput } from '@/components/common/FormInput'
import { Button, ButtonLink } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useAuth } from '@/hooks/useAuth'
import { ApiError, fieldErrorsFrom } from '@/lib/apiClient'
import { resendVerificationRequest } from '@/services/authApi'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function RegisterPage() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', terms: false })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false) // shown when verification is mandatory
  const [resent, setResent] = useState(false)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    const next = {}
    if (form.name.trim().length < 2) next.name = 'Enter your full name.'
    if (!EMAIL_RE.test(form.email)) next.email = 'Enter a valid email address.'
    if (form.password.length < 8) next.password = 'Use at least 8 characters.'
    if (form.confirm !== form.password) next.confirm = 'Passwords do not match.'
    if (!form.terms) next.terms = 'Please accept the terms to continue.'
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    try {
      const result = await register({ name: form.name, email: form.email, password: form.password, confirmPassword: form.confirm })
      if (result.verificationRequired) {
        setCheckEmail(true) // no session yet: the user must open the emailed link first
      } else {
        navigate('/', { replace: true }) // signed in; the dashboard shows a verification reminder
      }
    } catch (err) {
      if (err instanceof ApiError) {
        // The backend names the field as "confirmPassword"; this form calls it "confirm".
        const server = fieldErrorsFrom(err)
        if (server.confirmPassword) server.confirm = server.confirmPassword
        setErrors(server)
        setFormError(err.status === 400 ? 'Please fix the highlighted fields.' : err.message)
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const resend = async () => {
    await resendVerificationRequest(form.email.trim()).catch(() => {})
    setResent(true)
  }

  if (checkEmail) {
    return (
      <AuthLayout title="Check your email" subtitle="One more step to finish creating your account.">
        <div className="space-y-5 text-center" role="status">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-50 text-accent-600">
            <MailCheck className="size-7" />
          </span>
          <p className="text-sm text-muted">
            We sent a verification link to <strong className="text-ink">{form.email.trim()}</strong>. Open it to activate your account, then log in. The link expires in 24 hours.
          </p>
          {resent ? (
            <Alert variant="success">If the account still needs verification, a new link is on its way.</Alert>
          ) : (
            <Button variant="outline" onClick={resend} className="w-full">
              Resend verification email
            </Button>
          )}
          <ButtonLink to="/login" className="w-full">
            Go to login
          </ButtonLink>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start leaving on time, every time."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-700 transition-colors hover:text-brand-800 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {formError && <Alert>{formError}</Alert>}
        <FormInput label="Full name" icon={User} autoComplete="name" placeholder="Alex Morgan" value={form.name} error={errors.name} onChange={set('name')} />
        <FormInput label="Email" type="email" icon={Mail} autoComplete="email" placeholder="you@example.com" value={form.email} error={errors.email} onChange={set('email')} />
        <FormInput label="Password" type="password" icon={Lock} autoComplete="new-password" placeholder="At least 8 characters" value={form.password} error={errors.password} onChange={set('password')} />
        <FormInput label="Confirm password" type="password" icon={Lock} autoComplete="new-password" placeholder="Repeat your password" value={form.confirm} error={errors.confirm} onChange={set('confirm')} />
        <div>
          <label className="flex min-h-11 cursor-pointer items-start gap-2.5 py-2 text-sm">
            <Checkbox className="mt-0.5" checked={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.checked })} aria-invalid={Boolean(errors.terms)} />
            <span>
              I agree to the <span className="font-semibold text-brand-700">Terms &amp; Conditions</span> and{' '}
              <span className="font-semibold text-brand-700">Privacy Policy</span>.
            </span>
          </label>
          {errors.terms && <p role="alert" className="text-xs font-medium text-rose-600">{errors.terms}</p>}
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
          {!submitting && <ArrowRight aria-hidden="true" className="size-4" />}
        </Button>
      </form>
    </AuthLayout>
  )
}
