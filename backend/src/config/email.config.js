import { env } from './env.js'

// Single place that turns environment variables into email settings.
// The object is intentionally mutable so tests can flip e.g. verificationRequired.
export const emailConfig = {
  provider: env.EMAIL_PROVIDER,
  mode: env.EMAIL_MODE,
  apiKey: env.RESEND_API_KEY ?? null, // backend only: never sent to the browser, never logged
  fromAddress: env.EMAIL_FROM ?? 'no-reply@readyset.local',
  fromName: env.EMAIL_FROM_NAME,
  appBaseUrl: env.APP_BASE_URL,
  supportEmail: env.SUPPORT_EMAIL ?? null,
  verificationRequired: env.EMAIL_VERIFICATION_REQUIRED,
  remindersEnabled: env.EMAIL_REMINDERS_ENABLED,
  isProduction: env.NODE_ENV === 'production',
  // Retry policy for important emails: bounded, exponential backoff (delay = baseDelayMs * 2^(attempt-1)).
  retry: { maxAttempts: 3, baseDelayMs: env.NODE_ENV === 'test' ? 1 : 500 },
}

export const formatFrom = () => `${emailConfig.fromName} <${emailConfig.fromAddress}>`
