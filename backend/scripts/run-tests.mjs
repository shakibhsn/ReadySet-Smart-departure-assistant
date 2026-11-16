// Runs the backend test suite with Vitest, one test FILE per Vitest process.
//
// KNOWN ENVIRONMENT FLAKE (Windows): the Vitest *worker process* sometimes dies with exit code
// 3221226505 (0xC0000409), occasionally at startup and occasionally mid-run. Findings so far:
//   - it only reproduces when tests exercise the database (Prisma) code paths;
//   - it is NOT caused by the native bcrypt addon (swapping in pure-JS bcryptjs still crashed, 3 of 10 runs);
//   - it never produced an assertion failure; tests that did run always passed.
// The root cause was not identified. To keep `npm test` dependable, each file runs in its own process
// and a file is re-run (max 3 attempts) ONLY when its worker crashed. A real test failure
// (Vitest reports "N failed") is never retried and fails the whole run immediately.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const vitestBin = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))
const testsDir = new URL('../tests/', import.meta.url)
const MAX_ATTEMPTS = 3

const requested = process.argv.slice(2)
const files = requested.length > 0 ? requested : readdirSync(testsDir).filter((f) => f.endsWith('.test.js')).sort().map((f) => `tests/${f}`)

const totals = { files: 0, tests: 0, retries: 0 }

function runFile(file) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const run = spawnSync(process.execPath, [vitestBin, 'run', file], { encoding: 'utf8', env: process.env })
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`

    if (run.status === 0) {
      process.stdout.write(output)
      totals.tests += Number(/Tests\s+(?:\d+ failed \| )?(\d+) passed/.exec(output)?.[1] ?? 0)
      return true
    }

    const assertionFailures = /Tests\s+.*\d+ failed/.test(output) || /Test Files\s+.*\d+ failed/.test(output)
    const workerCrashed = !assertionFailures && (/Worker exited unexpectedly|Worker forks emitted error/.test(output) || !/Test Files/.test(output))
    if (!workerCrashed || attempt === MAX_ATTEMPTS) {
      process.stdout.write(output)
      return false
    }
    totals.retries++
    console.warn(`[run-tests] ${file}: Vitest worker crashed (not a test failure). Re-running this file (attempt ${attempt + 1}/${MAX_ATTEMPTS})...`)
  }
  return false
}

for (const file of files) {
  if (!runFile(file)) {
    console.error(`\n[run-tests] FAILED in ${file}`)
    process.exit(1)
  }
  totals.files++
}
console.log(`\n[run-tests] ${totals.files} test files, ${totals.tests} tests passed${totals.retries ? `, ${totals.retries} worker-crash re-run(s)` : ''}`)
