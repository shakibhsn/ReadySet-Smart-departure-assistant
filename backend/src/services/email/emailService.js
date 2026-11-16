import { prisma } from '../../config/database.js'
import { emailConfig, formatFrom } from '../../config/email.config.js'
import { logger, maskEmail } from '../../utils/logger.js'
import { createConfiguredProvider } from './providers.js'

/**
 * The ONLY entry point for sending email. Business code builds a template and calls
 * queueEmail() / sendEmail(); it never imports a provider SDK.
 *
 * Guarantees
 *  - Never throws (a provider outage must not crash the server or fail an unrelated request).
 *  - Every attempt is recorded in email_logs WITHOUT tokens, URLs or message bodies.
 *  - Important emails get a bounded number of retries with exponential backoff, only for
 *    retryable provider errors. The same idempotency key is reused across retries.
 *  - `dedupeKey` (unique in the DB) makes a send happen at most once, even across processes.
 *  - Status ACCEPTED means "the provider accepted it", NOT "delivered to an inbox".
 */

let provider = null
const getProvider = () => (provider ??= createConfiguredProvider())

/** Swap the provider (tests, or a future Brevo implementation). */
export function setEmailProvider(next) {
  provider = next
}

const pending = new Set()

/** Fire-and-forget send. The HTTP response never waits for (or reveals the timing of) the email. */
export function queueEmail(args) {
  const task = sendEmail(args)
    .catch(() => {})
    .finally(() => pending.delete(task))
  pending.add(task)
}

/** Resolves when all queued emails have finished (used by tests and graceful shutdown). */
export async function idle() {
  while (pending.size > 0) await Promise.all([...pending])
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function updateLog(id, data) {
  if (!id) return
  try {
    await prisma.emailLog.update({ where: { id }, data })
  } catch (err) {
    logger.error('email.log_update_failed', { code: err?.code })
  }
}

/**
 * @param {{ type: string, to: string, userId?: string|null, template: { subject: string, html: string, text: string }, dedupeKey?: string|null }} args
 * @returns {Promise<{ status: 'ACCEPTED' | 'FAILED' | 'DUPLICATE', logId: string|null }>}
 */
export async function sendEmail({ type, to, userId = null, template, dedupeKey = null }) {
  const recipient = to.trim().toLowerCase()
  let activeProvider
  let log = null

  try {
    activeProvider = getProvider()
    log = await prisma.emailLog.create({
      data: { userId, emailType: type, recipient, provider: activeProvider.name, status: 'PENDING', dedupeKey },
    })
  } catch (err) {
    if (err?.code === 'P2002') return { status: 'DUPLICATE', logId: null } // already sent / being sent
    logger.error('email.setup_failed', { type, code: err?.code ?? err?.name })
    if (!activeProvider) return { status: 'FAILED', logId: null }
    // Logging failed but the provider is available: still try to deliver an important email.
  }

  const { maxAttempts, baseDelayMs } = emailConfig.retry

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await activeProvider.send({
        to: recipient,
        from: formatFrom(),
        subject: template.subject,
        html: template.html,
        text: template.text,
        idempotencyKey: log?.id ? `readyset/${type}/${log.id}` : undefined,
      })
      await updateLog(log?.id, { status: 'ACCEPTED', attempts: attempt, providerMessageId: result.id ?? null, errorCode: null })
      logger.info('email.accepted', { type, to: maskEmail(recipient), provider: activeProvider.name, attempt, messageId: result.id ?? null })
      return { status: 'ACCEPTED', logId: log?.id ?? null }
    } catch (err) {
      const code = err?.code ?? err?.name ?? 'provider_error'
      const retryable = Boolean(err?.retryable) && attempt < maxAttempts
      await updateLog(log?.id, { status: retryable ? 'RETRYING' : 'FAILED', attempts: attempt, errorCode: String(code).slice(0, 60) })
      logger.warn(retryable ? 'email.retrying' : 'email.failed', { type, to: maskEmail(recipient), provider: activeProvider.name, attempt, code })
      if (!retryable) break
      await sleep(baseDelayMs * 2 ** (attempt - 1))
    }
  }
  return { status: 'FAILED', logId: log?.id ?? null }
}
