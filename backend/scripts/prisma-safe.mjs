// Guarded Prisma migrations:   node scripts/prisma-safe.mjs <dev|deploy> [--test] [--name <name>] [--create-only]
// Only `migrate dev` and `migrate deploy` can be run through this wrapper (never reset / db push).
// Before every run the env file is re-read and every connection URL is validated (see dbGuard.mjs);
// on any problem NOTHING is run and no URL is corrected, rewritten or printed. No database is contacted
// by this wrapper itself; Prisma connects only after the URLs passed.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { guardedEnv } from './dbGuard.mjs'

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [sub, ...rest] = process.argv.slice(2)
const fail = (lines) => {
  console.error(`Refusing to run Prisma:\n${lines.map((l) => `  - ${l}`).join('\n')}\nNo Prisma command was run. Fix backend/.env (or .env.test) by hand; this tool never rewrites it.`)
  process.exit(1)
}

if (!['dev', 'deploy'].includes(sub)) fail(['usage: prisma-safe.mjs <dev|deploy> [--test] [--name <name>] [--create-only] (only dev and deploy are allowed)'])
const args = []
let test = false
for (let i = 0; i < rest.length; i++) {
  const a = rest[i]
  if (a === '--test') test = true
  else if (a === '--create-only') args.push(a)
  else if (a === '--name' && rest[i + 1] && !rest[i + 1].startsWith('-')) args.push(a, rest[++i])
  else fail([`argument not allowed: ${a.split('=')[0]}`])
}
if (test && sub !== 'deploy') fail(['--test is only allowed with deploy (migrate dev must never run against the test database)'])

const { problems, env } = guardedEnv(test ? 'test' : sub, backend)
if (problems.length) fail(problems)

const cli = path.join(backend, 'node_modules', 'prisma', 'build', 'index.js')
if (!existsSync(cli)) fail(['the Prisma CLI is not installed (run: npm run setup:api)'])
const r = spawnSync(process.execPath, [cli, 'migrate', sub, ...args], { cwd: backend, env, stdio: 'inherit' })
process.exit(r.status ?? 1)
