import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Lock, Mail, User } from 'lucide-react'
import AuthLayout from '@/layouts/AuthLayout'
import { Alert } from '@/components/common/Alert'
import { FormInput } from '@/components/common/FormInput'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useAuth } from '@/hooks/useAuth'
import { ApiError, fieldErrorsFrom } from '@/lib/apiClient'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function RegisterPage() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', terms: false })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
      await register({ name: form.name, email: form.email, password: form.password, confirmPassword: form.confirm })
      navigate('/', { replace: true })
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
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start leaving on time, every time."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
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
        </Button>
      </form>
    </AuthLayout>
  )
}
