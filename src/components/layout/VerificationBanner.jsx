import { useState } from 'react'
import { MailWarning } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { resendVerificationRequest } from '@/services/authApi'

/**
 * Reminder for accounts whose email is not verified yet (this includes every account that existed
 * before verification was introduced; they are NOT locked out, just reminded).
 */
export function VerificationBanner() {
  const { user } = useAuth()
  const [status, setStatus] = useState('idle') // idle | sending | sent
  const [dismissed, setDismissed] = useState(false)

  if (!user || user.emailVerified || dismissed) return null

  const resend = async () => {
    setStatus('sending')
    await resendVerificationRequest(user.email).catch(() => {})
    setStatus('sent') // same wording regardless of outcome (the backend also throttles repeats)
  }

  return (
    <div role="region" aria-label="Email verification" className="border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-sm font-medium text-amber-900">
          <MailWarning className="mt-0.5 size-4 shrink-0" />
          {status === 'sent'
            ? 'If your address still needs verification, a new link is on its way. Check your inbox.'
            : `Please verify your email address (${user.email}) to secure your account and receive reminders.`}
        </p>
        <div className="flex gap-2">
          {status !== 'sent' && (
            <Button size="sm" variant="outline" onClick={resend} disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Resend verification email'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  )
}
