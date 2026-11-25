import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
    // Tests must NEVER reach a real server: a late request that outlives its test would otherwise hit a running dev API (answering
    // 401 for a fake token) and log the NEXT test out. The reserved port 9 refuses connections immediately.
    env: { VITE_API_BASE_URL: 'http://127.0.0.1:9/api' },
    testTimeout: 30000,
    // Screens render a ~430-option timezone list inside jsdom: running every test file at once on a busy Windows machine
    // starved them and caused random 5 s waits to expire. A few workers are as fast overall and far more reliable.
    maxWorkers: 4,
  },
})
