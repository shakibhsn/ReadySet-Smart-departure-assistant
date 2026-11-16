import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, MailCheck } from 'lucide-react'
import AuthLayout from '@/layouts/AuthLayout'
import { Alert } from '@/components/common/Alert'
import { FormInput } from '@/components/common/FormInput'
import { Button, ButtonLink } from '@/components/ui/button'
import { ApiError, fieldErrorsFrom } from '@/lib/apiClient'
import { forgotPasswordRequest } from '@/services/authApi'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!EMAIL_RE.test(email)) return setError('Enter a valid email address.')
    setError('')
    setSubmitting(true)
    try {
      await forgotPasswordRequest(email.trim())
      setSent(true) // same message whether or not the account exists
    } catch (err) {
      if (err instanceof ApiError) {
        setError(fieldErrorsFrom(err).email ?? '')
        setFormError(err.message)
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a link to choose a new one."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            Back to login
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="space-y-5 text-center" role="status">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-50 text-accent-600">
            <MailCheck className="size-7" />
          </span>
          <h2 className="text-lg font-bold">Check your email</h2>
          <p className="text-sm text-muted">
            If an account exists for <strong className="text-ink">{email.trim()}</strong>, we&apos;ve sent a password reset link. It expires in 30 minutes.
          </p>
          <ButtonLink to="/login" variant="outline" className="w-full">
            Back to login
          </ButtonLink>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {formError && <Alert>{formError}</Alert>}
          <FormInput
            label="Email"
            type="email"
            icon={Mail}
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            error={error}
            onChange={(e) => {
              setEmail(e.target.value)
              setError('')
            }}
          />
          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
