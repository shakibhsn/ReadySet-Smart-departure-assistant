import { renderEmail } from './baseTemplate.js'

export function resetPasswordTemplate({ name, url, expiresInMinutes }) {
  return {
    subject: 'Reset your ReadySet password',
    ...renderEmail({
      preheader: 'Use this link to choose a new password.',
      heading: 'Reset your password',
      paragraphs: [
        `Hi ${name}, we received a request to reset the password for your ReadySet account.`,
        `This link expires in ${expiresInMinutes} minutes and can only be used once.`,
      ],
      button: { label: 'Choose a new password', url },
      footnote: 'If you did not request this, you can ignore this email. Your password will not change.',
    }),
  }
}
