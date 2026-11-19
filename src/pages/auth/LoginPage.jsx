import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Lock, Mail } from 'lucide-react'
import AuthLayout from '@/layouts/AuthLayout'
import { Alert } from '@/components/common/Alert'
import { FormInput } from '@/components/common/FormInput'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useAuth } from '@/hooks/useAuth'
import { ApiError, fieldErrorsFrom } from '@/lib/apiClient'
import { resendVerificationRequest } from '@/services/authApi'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const [form, setForm] = useState({ email: '', password: '', remember: false })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [needsVerification, setNeedsVerification] = useState(false)
  const [resent, setResent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const next = {}
    if (!EMAIL_RE.test(form.email)) next.email = 'Enter a valid email address.'
    if (!form.password) next.password = 'Enter your password.'
    setErrors(next)
    setFormError('')
    setNeedsVerification(false)
    setResent(false)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    try {
      await login({ email: form.email.trim(), password: form.password, remember: form.remember })
      navigate(location.state?.from ?? '/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(fieldErrorsFrom(err))
        setFormError(err.message)
        // Only new accounts created while verification is mandatory are blocked; the password was correct.
        setNeedsVerification(err.code === 'EMAIL_NOT_VERIFIED')
      } else {
        setFormError('Something went wrong. Please try again.')
      }
      setSubmitting(false)
    }
  }

  const resend = async () => {
    await resendVerificationRequest(form.email.trim()).catch(() => {})
    setResent(true)
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to see when you should leave."
      footer={
        <>
          New to ReadySet?{' '}
          <Link to="/register" className="font-semibold text-brand-700 transition-colors hover:text-brand-800 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {formError && <Alert>{formError}</Alert>}
        {needsVerification && (
          <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm">
            <p className="font-medium text-brand-800">We sent a verification link to your email when you signed up. Open it, then log in.</p>
            {resent ? (
              <p role="status" className="font-semibold text-accent-700">If this account still needs verification, a new link is on its way.</p>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={resend}>
                Resend verification email
              </Button>
            )}
          </div>
        )}
        <FormInput
          label="Email"
          type="email"
          icon={Mail}
          autoComplete="email"
          placeholder="you@example.com"
          value={form.email}
          error={errors.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <FormInput
          label="Password"
          type="password"
          icon={Lock}
          autoComplete="current-password"
          placeholder="Enter your password"
          value={form.password}
          error={errors.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <div className="flex items-center justify-between gap-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium">
            <Checkbox checked={form.remember} onChange={(e) => setForm({ ...form, remember: e.target.checked })} />
            Remember me
          </label>
          <Link to="/forgot-password" className="text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
          {!submitting && <ArrowRight aria-hidden="true" className="size-4" />}
        </Button>
      </form>
    </AuthLayout>
  )
}
