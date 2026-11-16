import { renderEmail } from './baseTemplate.js'

export function passwordChangedTemplate({ name, whenText }) {
  return {
    subject: 'Your ReadySet password was changed',
    ...renderEmail({
      preheader: 'Your password was just changed and other sessions were signed out.',
      heading: 'Your password was changed',
      paragraphs: [
        `Hi ${name}, the password for your ReadySet account was changed on ${whenText}. For your security, you were signed out on all devices.`,
        'If this was you, no further action is needed.',
      ],
      footnote: 'If you did not change your password, reset it immediately using "Forgot password" on the login page and contact support.',
    }),
  }
}
