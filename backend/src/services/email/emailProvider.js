/**
 * EMAIL PROVIDER CONTRACT (the only thing the rest of the app depends on)
 *
 *   provider.name: string
 *   provider.send({ to, from, subject, html, text, idempotencyKey? })
 *       -> Promise<{ id: string | null }>        // id = the provider's message id
 *       -> throws EmailProviderError on failure
 *
 * To switch to another provider (Brevo, SES, SMTP...) implement this contract in a new file
 * (see resendProvider.js), register it in providers.js and set EMAIL_PROVIDER. Nothing in the
 * authentication or business logic needs to change.
 *
 * "send" resolving means the provider ACCEPTED the message. It does not mean delivery.
 */
export class EmailProviderError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, retryable?: boolean }} [opts]
   */
  constructor(message, { code = 'provider_error', retryable = false } = {}) {
    super(message)
    this.name = 'EmailProviderError'
    this.code = code
    this.retryable = retryable
  }
}
