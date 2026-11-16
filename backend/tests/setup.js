import { afterAll, afterEach, beforeEach } from 'vitest'
import { prisma } from '../src/config/database.js'
import { emailConfig } from '../src/config/email.config.js'
import { databaseNameOf, env } from '../src/config/env.js'
import { idle, setEmailProvider } from '../src/services/email/emailService.js'
import { mailbox } from './helpers.js'

// env.js already refuses to load unless the database name ends with "_test";
// this second check guards the delete below.
if (!databaseNameOf(env.DATABASE_URL).endsWith('_test')) {
  throw new Error('Refusing to run against a non-test database')
}
// Automated tests must never send real email.
if (emailConfig.mode !== 'console') throw new Error('Refusing to run tests with a real email provider')

// Only rows created by the tests (reserved @readyset.test domain) are ever removed.
// Tokens, events, rules and email logs are removed by the ON DELETE CASCADE of their owner.
const cleanup = () => prisma.user.deleteMany({ where: { email: { endsWith: '@readyset.test' } } })
const defaults = { ...emailConfig, retry: { ...emailConfig.retry } }

beforeEach(async () => {
  setEmailProvider(mailbox)
  mailbox.reset()
  Object.assign(emailConfig, defaults, { retry: { ...defaults.retry } })
  await cleanup()
})
afterEach(async () => {
  await idle()
  Object.assign(emailConfig, defaults, { retry: { ...defaults.retry } })
})
afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})
