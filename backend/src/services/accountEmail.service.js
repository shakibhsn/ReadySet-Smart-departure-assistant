import bcrypt from 'bcrypt'
import { prisma } from '../config/database.js'
import { emailConfig } from '../config/email.config.js'
import { env } from '../config/env.js'
import { AppError } from '../utils/apiResponse.js'
import { maskEmail } from '../utils/logger.js'
import { emailChangeConfirmTemplate, emailChangedNoticeTemplate } from '../templates/emailChangeTemplates.js'
import { passwordChangedTemplate } from '../templates/passwordChangedTemplate.js'
import { resetPasswordTemplate } from '../templates/resetPasswordTemplate.js'
import { verifyEmailTemplate } from '../templates/verifyEmailTemplate.js'
import { TOKEN_TTL_MINUTES, TOKEN_TYPES, consumeToken, issueToken, issuedRecently } from './authToken.service.js'
import { queueEmail } from './email/emailService.js'

/**
 * Email-driven account flows. Every flow that could reveal whether an address is registered
 * (resend verification, forgot password) returns nothing and does its work silently, so the HTTP
 * response is identical for known and unknown addresses. Emails are queued (not awaited), so the
 * response also does not wait on the provider.
 */

const linkTo = (path, token) => `${emailConfig.appBaseUrl}${path}?token=${encodeURIComponent(token)}`
const whenText = () => new Date().toUTCString()

// ---------- email verification ----------

/** Issues a fresh verification token (superseding old ones) and queues the email. */
export async function sendVerificationEmail(user) {
  const token = await issueToken(prisma, user.id, TOKEN_TYPES.EMAIL_VERIFY)
  queueEmail({
    type: 'EMAIL_VERIFY',
    to: user.email,
    userId: user.id,
    template: verifyEmailTemplate({ name: user.name, url: linkTo('/verify-email', token), expiresInHours: TOKEN_TTL_MINUTES.EMAIL_VERIFY / 60 }),
  })
}

export async function resendVerification(email) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, emailVerifiedAt: true } })
  if (!user || user.emailVerifiedAt) return
  if (await issuedRecently(prisma, user.id, TOKEN_TYPES.EMAIL_VERIFY)) return // cooldown: silently skip
  await sendVerificationEmail(user)
}

export async function verifyEmail(rawToken) {
  await prisma.$transaction(async (tx) => {
    const row = await consumeToken(tx, rawToken, TOKEN_TYPES.EMAIL_VERIFY)
    await tx.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } })
  })
}

// ---------- forgot / reset password ----------

export async function requestPasswordReset(email) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } })
  if (!user) return
  if (await issuedRecently(prisma, user.id, TOKEN_TYPES.PASSWORD_RESET)) return
  const token = await issueToken(prisma, user.id, TOKEN_TYPES.PASSWORD_RESET)
  queueEmail({
    type: 'PASSWORD_RESET',
    to: user.email,
    userId: user.id,
    template: resetPasswordTemplate({ name: user.name, url: linkTo('/reset-password', token), expiresInMinutes: TOKEN_TTL_MINUTES.PASSWORD_RESET }),
  })
}

export async function resetPassword(rawToken, newPassword) {
  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS)

  const user = await prisma.$transaction(async (tx) => {
    const row = await consumeToken(tx, rawToken, TOKEN_TYPES.PASSWORD_RESET)
    const updated = await tx.user.update({
      where: { id: row.userId },
      // Bumping tokenVersion invalidates every JWT issued before this moment (all devices).
      data: { passwordHash, tokenVersion: { increment: 1 } },
      select: { id: true, name: true, email: true },
    })
    // Any other outstanding reset links for this account are now useless.
    await tx.authToken.deleteMany({ where: { userId: row.userId, type: TOKEN_TYPES.PASSWORD_RESET, usedAt: null } })
    return updated
  })

  queueEmail({ type: 'PASSWORD_CHANGED', to: user.email, userId: user.id, template: passwordChangedTemplate({ name: user.name, whenText: whenText() }) })
}

// ---------- email address change ----------

export async function requestEmailChange(userId, newEmail, password) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, passwordHash: true } })
  if (!user) throw new AppError(401, 'Invalid token')

  // Re-authentication: a stolen session alone must not be able to redirect the account's email.
  // 403 (not 401) so the frontend does not treat a wrong password as an expired session.
  if (!(await bcrypt.compare(password, user.passwordHash))) throw new AppError(403, 'Incorrect password.', [{ field: 'password', message: 'Incorrect password' }], 'INVALID_PASSWORD')
  if (newEmail === user.email) throw new AppError(400, 'Validation failed', [{ field: 'newEmail', message: 'This is already your email address' }])
  if (await issuedRecently(prisma, userId, TOKEN_TYPES.EMAIL_CHANGE)) throw new AppError(429, 'Please wait a minute before requesting another change.', [], 'COOLDOWN')

  // Address already used by someone else: respond exactly like success and send nothing (no oracle).
  const taken = await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } })
  if (taken) return

  const token = await issueToken(prisma, userId, TOKEN_TYPES.EMAIL_CHANGE, { newEmail })
  queueEmail({
    type: 'EMAIL_CHANGE_CONFIRM',
    to: newEmail, // sent to the NEW address: proves the user controls it
    userId,
    template: emailChangeConfirmTemplate({ name: user.name, url: linkTo('/confirm-email-change', token), expiresInMinutes: TOKEN_TTL_MINUTES.EMAIL_CHANGE }),
  })
}

export async function confirmEmailChange(rawToken) {
  const { user, oldEmail } = await prisma.$transaction(async (tx) => {
    const row = await consumeToken(tx, rawToken, TOKEN_TYPES.EMAIL_CHANGE)
    if (!row.newEmail) throw new AppError(400, 'This link is invalid.', [], 'INVALID_TOKEN')
    const current = await tx.user.findUnique({ where: { id: row.userId }, select: { email: true } })
    let updated
    try {
      updated = await tx.user.update({
        where: { id: row.userId },
        // The new address is verified by definition (the link was delivered to it). Sessions are revoked.
        data: { email: row.newEmail, emailVerifiedAt: new Date(), tokenVersion: { increment: 1 } },
        select: { id: true, name: true, email: true },
      })
    } catch (err) {
      if (err?.code === 'P2002') throw new AppError(409, 'That email address is already in use.', [], 'EMAIL_TAKEN')
      throw err
    }
    await tx.authToken.deleteMany({ where: { userId: row.userId, type: { in: [TOKEN_TYPES.EMAIL_CHANGE, TOKEN_TYPES.EMAIL_VERIFY] }, usedAt: null } })
    return { user: updated, oldEmail: current.email }
  })

  // Tell the OLD address (the real owner, if this was an account takeover) that it happened.
  queueEmail({
    type: 'EMAIL_CHANGED_NOTICE',
    to: oldEmail,
    userId: user.id,
    template: emailChangedNoticeTemplate({ name: user.name, newEmailMasked: maskEmail(user.email), whenText: whenText() }),
  })
}
