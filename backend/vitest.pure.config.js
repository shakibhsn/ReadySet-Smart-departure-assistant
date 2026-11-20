// Database-free test run:  npm run test:pure
// Only files that never touch PostgreSQL (no tests/setup.js, which cleans test rows through Prisma).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/departure.test.js', 'tests/dbGuard.test.js', 'tests/envGuard.test.js', 'tests/weatherPure.test.js'],
    testTimeout: 20000,
  },
})
