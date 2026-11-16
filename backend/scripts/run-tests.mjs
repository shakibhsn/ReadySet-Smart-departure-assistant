// Runs the backend test suite with Vitest.
//
// KNOWN ENVIRONMENT FLAKE (Windows): in roughly 1 run out of 4-5 the Vitest *worker process* dies at
// startup with exit code 3221226505 (0xC0000409) before any test executes. It was reproduced only
// when the worker loads bcrypt AND Prisma together (each alone: 0 crashes in 25 runs; tests that load
// neither: 0 in 25) and never produced an assertion failure.
//
// To keep `npm test` usable this wrapper re-runs the WHOLE suite when (and only when) the worker
// crashed. A real test failure (Vitest reports "N failed") is never retried and fails immediately.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const vitestBin = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))
const MAX_ATTEMPTS = 3
const extraArgs = process.argv.slice(2)

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  const run = spawnSync(process.execPath, [vitestBin, 'run', ...extraArgs], { encoding: 'utf8', env: process.env })
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
  process.stdout.write(output)

  if (run.status === 0) process.exit(0)

  const assertionFailures = /Tests\s+.*\d+ failed/.test(output) || /Test Files\s+.*\d+ failed/.test(output)
  const workerCrashed = !assertionFailures && (/Worker exited unexpectedly|Worker forks emitted error/.test(output) || !/Test Files/.test(output))
  if (!workerCrashed || attempt === MAX_ATTEMPTS) process.exit(run.status ?? 1)

  console.warn(`\n[run-tests] Vitest worker crashed (not a test failure). Re-running the full suite (attempt ${attempt + 1}/${MAX_ATTEMPTS})...\n`)
}
