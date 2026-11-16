import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react'
import AuthLayout from '@/layouts/AuthLayout'
import { Alert } from '@/components/common/Alert'
import { Button, ButtonLink } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/lib/apiClient'
import { getToken } from '@/lib/tokenStorage'
import { resendVerificationRequest, verifyEmailRequest } from '@/services/authApi'

const MESSAGES = {
  TOKEN_EXPIRED: 'This verification link has expired.',
  TOKEN_USED: 'This verification link has already been used.',
  INVALID_TOKEN: 'This verification link is not valid.',
}

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { user, isAuthenticated, refreshUser } = useAuth()
  const [state, setState] = useState(token ? 'loading' : 'error')
  const [message, setMessage] = useState(token ? '' : MESSAGES.INVALID_TOKEN)
  const [resent, setResent] = useState(false)
  const started = useRef(false) // the token is single-use: never submit it twice (StrictMode runs effects twice in dev)

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    verifyEmailRequest(token)
      .then(async () => {
        setState('success')
        // Refresh whenever a session exists (isAuthenticated can still be false while it is being restored).
        if (getToken()) await refreshUser().catch(() => {}) // updates the "please verify" banner
      })
      .catch((err) => {
        setState('error')
        setMessage(err instanceof ApiError ? (MESSAGES[err.code] ?? err.message) : 'Something went wrong. Please try again.')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const resend = async () => {
    if (!user) return
    await resendVerificationRequest(user.email).catch(() => {})
    setResent(true)
  }

  return (
    <AuthLayout title="Email verification" subtitle="Confirming your email address.">
      {state === 'loading' && (
        <div role="status" className="flex flex-col items-center gap-3 py-6 text-muted">
          <Loader2 className="size-8 animate-spin text-brand-600" />
          Verifying…
        </div>
      )}
      {state === 'success' && (
        <div className="space-y-5 text-center" role="status">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-50 text-accent-600">
            <CheckCircle2 className="size-7" />
          </span>
          <h2 className="text-lg font-bold">Your email is verified</h2>
          <p className="text-sm text-muted">Thanks! Your ReadySet account is confirmed.</p>
          <ButtonLink to={isAuthenticated ? '/' : '/login'} size="lg" className="w-full">
            {isAuthenticated ? 'Go to dashboard' : 'Log in'}
          </ButtonLink>
        </div>
      )}
      {state === 'error' && (
        <div className="space-y-5 text-center" role="alert">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <TriangleAlert className="size-7" />
          </span>
          <h2 className="text-lg font-bold">{message}</h2>
          {isAuthenticated ? (
            <>
              <p className="text-sm text-muted">Request a new verification email to continue.</p>
              {resent && <Alert variant="success">If your address still needs verification, a new link is on its way.</Alert>}
              <Button onClick={resend} disabled={resent} className="w-full">
                Send a new link
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted">Log in and use &ldquo;Resend verification&rdquo; in Settings to get a new link.</p>
          )}
        </div>
      )}
    </AuthLayout>
  )
}
