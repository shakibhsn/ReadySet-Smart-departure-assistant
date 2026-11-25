// Database-free test run:  npm run test:pure
// Only files that never touch PostgreSQL (no tests/setup.js, which cleans test rows through Prisma).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/departure.test.js', 'tests/dbGuard.test.js', 'tests/envGuard.test.js', 'tests/weatherPure.test.js', 'tests/notificationRules.test.js', 'tests/phase1Pure.test.js', 'tests/phase2Pure.test.js', 'tests/phase3Pure.test.js', 'tests/phase4Pure.test.js', 'tests/phase5Pure.test.js', 'tests/explorePure.test.js', 'tests/priorityConflicts.test.js'],
    testTimeout: 20000,
  },
})
