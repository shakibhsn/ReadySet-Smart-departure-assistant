import { afterAll, beforeEach } from 'vitest'
import { prisma } from '../src/config/database.js'
import { databaseNameOf, env } from '../src/config/env.js'

// env.js already refuses to load unless the database name ends with "_test";
// this second check guards the delete below.
if (!databaseNameOf(env.DATABASE_URL).endsWith('_test')) {
  throw new Error('Refusing to run against a non-test database')
}

// Only rows created by the tests (reserved @readyset.test domain) are ever removed.
const cleanup = () => prisma.user.deleteMany({ where: { email: { endsWith: '@readyset.test' } } })

beforeEach(cleanup)
afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})
