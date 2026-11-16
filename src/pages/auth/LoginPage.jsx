import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Lock, Mail } from 'lucide-react'
import AuthLayout from '@/layouts/AuthLayout'
import { Alert } from '@/components/common/Alert'
import { FormInput } from '@/components/common/FormInput'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useAuth } from '@/hooks/useAuth'
import { ApiError, fieldErrorsFrom } from '@/lib/apiClient'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const [form, setForm] = useState({ email: '', password: '', remember: true })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const next = {}
    if (!EMAIL_RE.test(form.email)) next.email = 'Enter a valid email address.'
    if (!form.password) next.password = 'Enter your password.'
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    try {
      await login({ email: form.email.trim(), password: form.password, remember: form.remember })
      navigate(location.state?.from ?? '/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(fieldErrorsFrom(err))
        setFormError(err.message)
      } else {
        setFormError('Something went wrong. Please try again.')
      }
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to see when you should leave."
      footer={
        <>
          New to ReadySet?{' '}
          <Link to="/register" className="font-semibold text-brand-700 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {formError && <Alert>{formError}</Alert>}
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
          <a href="#forgot" onClick={(e) => e.preventDefault()} className="text-sm font-semibold text-brand-700 hover:underline">
            Forgot password?
          </a>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </AuthLayout>
  )
}
