import { EmailProviderError } from '../src/services/email/emailProvider.js'

/** In-memory fake email provider. Tests never talk to Resend or any real mail server. */
export function createMailbox() {
  const sent = []
  const failures = []
  let counter = 0

  return {
    name: 'mock',
    sent,
    /** Make the next `times` sends fail with the given error properties. */
    failNext(times = 1, { retryable = false, code = 'mock_failure' } = {}) {
      for (let i = 0; i < times; i++) failures.push({ retryable, code })
    },
    reset() {
      sent.length = 0
      failures.length = 0
      counter = 0
    },
    async send(message) {
      const failure = failures.shift()
      if (failure) throw new EmailProviderError('mock provider failure', failure)
      sent.push({ ...message, id: `msg_${++counter}` })
      return { id: `msg_${counter}` }
    },
    to: (address) => sent.filter((m) => m.to === address.toLowerCase()),
  }
}

/** Extracts the plaintext token from the link inside an email's text body. */
export const tokenFrom = (message) => /token=([A-Za-z0-9_-]{20,})/.exec(message.text)?.[1]
