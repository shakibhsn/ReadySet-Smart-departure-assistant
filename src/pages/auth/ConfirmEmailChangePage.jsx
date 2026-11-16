import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react'
import AuthLayout from '@/layouts/AuthLayout'
import { ButtonLink } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/lib/apiClient'
import { confirmEmailChangeRequest } from '@/services/authApi'

const MESSAGES = {
  TOKEN_EXPIRED: 'This confirmation link has expired.',
  TOKEN_USED: 'This confirmation link has already been used.',
  INVALID_TOKEN: 'This confirmation link is not valid.',
  EMAIL_TAKEN: 'That email address is already in use by another account.',
}

export default function ConfirmEmailChangePage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { isAuthenticated, logout } = useAuth()
  const [state, setState] = useState(token ? 'loading' : 'error')
  const [message, setMessage] = useState(token ? '' : MESSAGES.INVALID_TOKEN)
  const started = useRef(false) // single-use token: submit once only

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    confirmEmailChangeRequest(token)
      .then(async () => {
        setState('success')
        // The backend revoked every session for this account, so drop the local copy too.
        // (Do not rely on isAuthenticated here: it is still false while a stored session is being restored.)
        await logout()
      })
      .catch((err) => {
        setState('error')
        setMessage(err instanceof ApiError ? (MESSAGES[err.code] ?? err.message) : 'Something went wrong. Please try again.')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return (
    <AuthLayout title="Confirm email change" subtitle="Switching the email address on your account.">
      {state === 'loading' && (
        <div role="status" className="flex flex-col items-center gap-3 py-6 text-muted">
          <Loader2 className="size-8 animate-spin text-brand-600" />
          Confirming…
        </div>
      )}
      {state === 'success' && (
        <div className="space-y-5 text-center" role="status">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-50 text-accent-600">
            <CheckCircle2 className="size-7" />
          </span>
          <h2 className="text-lg font-bold">Your email address was changed</h2>
          <p className="text-sm text-muted">For your security you were signed out everywhere. Log in with your new address.</p>
          <ButtonLink to="/login" size="lg" className="w-full">
            Log in
          </ButtonLink>
        </div>
      )}
      {state === 'error' && (
        <div className="space-y-5 text-center" role="alert">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <TriangleAlert className="size-7" />
          </span>
          <h2 className="text-lg font-bold">{message}</h2>
          <p className="text-sm text-muted">Your email address has not been changed. You can request the change again from Settings.</p>
          <ButtonLink to={isAuthenticated ? '/settings' : '/login'} variant="outline" className="w-full">
            {isAuthenticated ? 'Go to settings' : 'Log in'}
          </ButtonLink>
        </div>
      )}
    </AuthLayout>
  )
}
