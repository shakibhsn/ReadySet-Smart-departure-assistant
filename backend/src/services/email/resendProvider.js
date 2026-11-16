import { Resend } from 'resend'
import { EmailProviderError } from './emailProvider.js'

// Errors that are worth retrying: rate limits, transient server problems, concurrent idempotent requests.
const RETRYABLE_CODES = new Set(['rate_limit_exceeded', 'application_error', 'internal_server_error', 'concurrent_idempotent_requests'])

/** Resend implementation of the provider contract. Backend-only: the API key never leaves the server. */
export function createResendProvider({ apiKey, client = new Resend(apiKey) }) {
  return {
    name: 'resend',
    async send({ to, from, subject, html, text, idempotencyKey }) {
      let response
      try {
        response = await client.emails.send({ from, to, subject, html, text }, idempotencyKey ? { idempotencyKey } : undefined)
      } catch {
        // Network failure / SDK exception: the request may not have reached Resend.
        throw new EmailProviderError('Could not reach the email provider', { code: 'network_error', retryable: true })
      }
      const { data, error } = response
      if (error) {
        const retryable = RETRYABLE_CODES.has(error.name) || (typeof error.statusCode === 'number' && (error.statusCode >= 500 || error.statusCode === 429))
        // Only the error CODE is kept; the message may echo addresses.
        throw new EmailProviderError('Email provider rejected the request', { code: error.name ?? 'provider_error', retryable })
      }
      return { id: data?.id ?? null }
    },
  }
}
