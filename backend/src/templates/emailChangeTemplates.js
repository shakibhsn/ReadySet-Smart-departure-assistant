import { renderEmail } from './baseTemplate.js'

/** Sent to the NEW address: the email is only switched after this link is opened. */
export function emailChangeConfirmTemplate({ name, url, expiresInMinutes }) {
  return {
    subject: 'Confirm your new ReadySet email address',
    ...renderEmail({
      preheader: 'Confirm this address to use it for your ReadySet account.',
      heading: 'Confirm your new email address',
      paragraphs: [
        `Hi ${name}, you asked to use this address for your ReadySet account.`,
        `Open the link below to confirm. It expires in ${expiresInMinutes} minutes. Until you do, your account keeps using the old address.`,
      ],
      button: { label: 'Confirm new email address', url },
      footnote: 'If you did not request this change, ignore this email. Nothing will change.',
    }),
  }
}

/** Sent to the OLD address after the change succeeded, so the real owner can react. */
export function emailChangedNoticeTemplate({ name, newEmailMasked, whenText }) {
  return {
    subject: 'The email address on your ReadySet account was changed',
    ...renderEmail({
      preheader: 'Your account now uses a different email address.',
      heading: 'Your email address was changed',
      paragraphs: [
        `Hi ${name}, the email address on your ReadySet account was changed on ${whenText}. You were signed out on all devices.`,
      ],
      details: [['New address', newEmailMasked]],
      footnote: 'If you did not make this change, contact support immediately.',
    }),
  }
}
