import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test' },
    setupFiles: ['./tests/setup.js'],
    // Tests share one database, so run files one at a time in a single reused worker.
    // (Spawning a fresh worker per file intermittently crashed at startup on Windows with the
    // native bcrypt / Prisma modules: exit code 0xC0000409.)
    fileParallelism: false,
    isolate: false,
    maxWorkers: 1,
    testTimeout: 20000,
  },
})
