import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test' },
    setupFiles: ['./tests/setup.js'],
    // Tests share one database, so run files one at a time.
    fileParallelism: false,
    testTimeout: 20000,
  },
})
