import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Lock, TriangleAlert } from 'lucide-react'
import AuthLayout from '@/layouts/AuthLayout'
import { Alert } from '@/components/common/Alert'
import { FormInput } from '@/components/common/FormInput'
import { Button, ButtonLink } from '@/components/ui/button'
import { ApiError, fieldErrorsFrom } from '@/lib/apiClient'
import { resetPasswordRequest } from '@/services/authApi'

const TOKEN_PROBLEMS = {
  TOKEN_EXPIRED: 'This reset link has expired.',
  TOKEN_USED: 'This reset link has already been used.',
  INVALID_TOKEN: 'This reset link is not valid.',
}

function ProblemPanel({ message }) {
  return (
    <div className="space-y-5 text-center" role="alert">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
        <TriangleAlert className="size-7" />
      </span>
      <h2 className="text-lg font-bold">{message}</h2>
      <p className="text-sm text-muted">Reset links expire after 30 minutes and work only once. Request a new one to continue.</p>
      <ButtonLink to="/forgot-password" className="w-full">
        Request a new link
      </ButtonLink>
    </div>
  )
}

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [tokenProblem, setTokenProblem] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    const next = {}
    if (form.password.length < 8) next.password = 'Use at least 8 characters.'
    if (form.confirm !== form.password) next.confirm = 'Passwords do not match.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    try {
      await resetPasswordRequest({ token, password: form.password, confirmPassword: form.confirm })
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError && TOKEN_PROBLEMS[err.code]) {
        setTokenProblem(TOKEN_PROBLEMS[err.code])
      } else if (err instanceof ApiError) {
        const server = fieldErrorsFrom(err)
        setErrors({ password: server.password, confirm: server.confirmPassword })
        setFormError(err.status === 400 ? 'Please fix the highlighted fields.' : err.message)
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  let body
  if (!token || tokenProblem) {
    body = <ProblemPanel message={tokenProblem || TOKEN_PROBLEMS.INVALID_TOKEN} />
  } else if (done) {
    body = (
      <div className="space-y-5 text-center" role="status">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-50 text-accent-600">
          <CheckCircle2 className="size-7" />
        </span>
        <h2 className="text-lg font-bold">Password changed</h2>
        <p className="text-sm text-muted">You were signed out on all devices. Log in with your new password.</p>
        <ButtonLink to="/login" size="lg" className="w-full">
          Back to login
        </ButtonLink>
      </div>
    )
  } else {
    body = (
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {formError && <Alert>{formError}</Alert>}
        <FormInput label="New password" type="password" icon={Lock} autoComplete="new-password" placeholder="At least 8 characters" value={form.password} error={errors.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <FormInput label="Confirm new password" type="password" icon={Lock} autoComplete="new-password" placeholder="Repeat your password" value={form.confirm} error={errors.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? 'Saving…' : 'Change password'}
        </Button>
      </form>
    )
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Use a strong password you don't use anywhere else."
      footer={
        <Link to="/login" className="font-semibold text-brand-700 hover:underline">
          Back to login
        </Link>
      }
    >
      {body}
    </AuthLayout>
  )
}
