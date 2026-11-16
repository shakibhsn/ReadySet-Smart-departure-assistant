import { maskEmail } from '../../utils/logger.js'

/**
 * Development provider: prints a preview instead of sending anything.
 * Outside production the plain-text body is printed (so you can click verification / reset
 * links locally). In production the body is never printed, because it contains secrets.
 */
export function createConsoleProvider({ includeBody }) {
  return {
    name: 'console',
    async send({ to, subject, text }) {
      const lines = [`[email:console] to=${maskEmail(to)} subject="${subject}"`]
      if (includeBody) lines.push('---------------- body ----------------', text, '--------------------------------------')
      console.log(lines.join('\n'))
      return { id: null }
    },
  }
}
