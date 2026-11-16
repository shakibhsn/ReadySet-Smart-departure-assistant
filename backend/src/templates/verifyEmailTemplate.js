import { renderEmail } from './baseTemplate.js'

export function verifyEmailTemplate({ name, url, expiresInHours }) {
  const subject = 'Verify your email address for ReadySet'
  return {
    subject,
    ...renderEmail({
      preheader: 'Confirm your email address to finish setting up your ReadySet account.',
      heading: 'Verify your email address',
      paragraphs: [
        `Hi ${name}, welcome to ReadySet. Please confirm that this is your email address.`,
        `This link expires in ${expiresInHours} hours.`,
      ],
      button: { label: 'Verify email address', url },
      footnote: 'If you did not create a ReadySet account, you can safely ignore this email.',
    }),
  }
}
