import { env } from '../config/env.js'

// Minimal structured (JSON-lines) logger. Silent during tests.
// RULE: never pass passwords, tokens, reset/verification URLs or full email addresses as fields.

/** "jane.doe@example.com" -> "j***@e***.com" so logs stay useful without storing personal data. */
export function maskEmail(address) {
  const [local = '', domain = ''] = String(address).split('@')
  const dot = domain.lastIndexOf('.')
  const host = dot > 0 ? domain.slice(0, dot) : domain
  const tld = dot > 0 ? domain.slice(dot) : ''
  return `${local.slice(0, 1)}***@${host.slice(0, 1)}***${tld}`
}

function write(level, event, fields) {
  if (env.NODE_ENV === 'test') return
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields })
  if (level === 'error') console.error(line)
  else console.log(line)
}

export const logger = {
  info: (event, fields = {}) => write('info', event, fields),
  warn: (event, fields = {}) => write('warn', event, fields),
  error: (event, fields = {}) => write('error', event, fields),
}
