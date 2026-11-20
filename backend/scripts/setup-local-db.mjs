// Isolated ReadySet database setup:  npm run db:setup   (from the project root or backend/)
//
// Creates a NEW role + 3 NEW databases used only by ReadySet:
//   role readyset_isolated_app, databases readyset_isolated_dev / _test / _shadow
//
// RULES THIS SCRIPT FOLLOWS
//  - Phase 1 is read-only. If ANY of the four names already exists it stops and reports; it never adopts,
//    modifies, reuses, drops, truncates, deletes or resets anything, and never touches other roles/databases.
//  - The old readyset_app / readyset_dev / readyset_test resources are never referenced or touched.
//  - Least privilege: LOGIN only. The role owns only the three new databases.
//  - Password: random, never printed, written only to the gitignored backend/.env and backend/.env.test.
//  - Prisma only ever receives URLs that were validated to target the intended isolated database, with every
//    inherited connection variable removed. Only `prisma migrate deploy` is run (never reset / db push).
//  - On failure it lists what was done / failed and does NOT clean up. See README "Partial-failure recovery".
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { ALLOWED_HOSTS, ALLOWED_PORTS, guardedEnv, validateUrls } from './dbGuard.mjs'

const VERSION = 'setup-local-db v6 (isolated)'
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOST = process.env.PGHOST ?? 'localhost'
const PORT = String(process.env.PGPORT ?? '5432')
const SETUP_HOSTS = ALLOWED_HOSTS // explicit allowlist (documented in README): local server only
const ROLE = 'readyset_isolated_app'
const DB = { dev: 'readyset_isolated_dev', test: 'readyset_isolated_test', shadow: 'readyset_isolated_shadow' }

// ---------- output: every line is scrubbed and also written to a gitignored log ----------
const steps = []
const secrets = new Set()
const scrub = (text) => {
  let out = String(text ?? '')
  for (const s of secrets) if (s && s.length > 3) out = out.split(s).join('***')
  return out.replace(/postgres(ql)?:\/\/\S+/gi, 'postgresql://***')
}
const logFile = path.join(backend, '.db-setup.log')
writeFileSync(logFile, `${VERSION}  ${new Date().toISOString()}\n`)
for (const method of ['log', 'error']) {
  const original = console[method].bind(console)
  console[method] = (...args) => {
    original(...args)
    try { appendFileSync(logFile, `${scrub(args.join(' '))}\n`) } catch { /* logging must never break setup */ }
  }
}
process.on('exit', (code) => console.log(`\n[${VERSION}] exit code ${code}. Full log: ${logFile}`))
console.log(VERSION)

const done = (name) => {
  steps.push({ name, status: 'done' })
  console.log(`  ok  ${name}`)
}
const summary = () => {
  console.log('\nSummary:')
  for (const s of steps) console.log(`  [${s.status}] ${s.name}`)
}
function stop(message, { failedStep, code = 1 } = {}) {
  if (failedStep) steps.push({ name: failedStep, status: 'failed' })
  console.error(`\n${scrub(message)}`)
  if (failedStep) console.error(`Failed step: ${failedStep} (server ${HOST}:${PORT}, psql: ${psqlBin ?? 'not found'})`)
  summary()
  const changed = steps.some((s) => s.status === 'done' && /^(created|granted|wrote|applied)/.test(s.name))
  console.error(
    changed
      ? '\nSome changes WERE made (see "done" above). Nothing was cleaned up automatically.\nSee README "Partial-failure recovery" before re-running: the script stops on resources it already created.'
      : '\nNo database changes were made.',
  )
  process.exit(code)
}

// ---------- hidden password prompt (interactive terminals only) ----------
function askHidden(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
    stop('This script needs an interactive terminal so the password can be typed hidden. Run it directly in a terminal (not piped or redirected).')
  }
  return new Promise((resolve) => {
    const stdin = process.stdin
    const restore = () => stdin.isTTY && stdin.setRawMode(false)
    process.once('exit', restore)
    process.stdout.write(question)
    let value = ''
    let emptyTries = 0
    const shownAt = Date.now()
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const onData = (chunk) => {
      for (const c of chunk) {
        if (c === '\r' || c === '\n' || c === '\u0004') {
          if (value === '') {
            if (Date.now() - shownAt < 200) continue // stale Enter from launching the command
            if (++emptyTries >= 3) {
              restore()
              stop('No password was entered 3 times (typing is hidden, so nothing appears on screen). Run the command again.', { failedStep: 'read postgres password' })
            }
            process.stdout.write('\nNo password was entered. Typing is hidden; nothing appears on screen. Try again: ')
            continue
          }
          restore()
          stdin.pause()
          stdin.off('data', onData)
          process.stdout.write('\n')
          return resolve(value)
        }
        if (c === '\u0003') {
          restore()
          process.stdout.write('\n')
          process.exit(130)
        }
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1)
        else value += c
      }
    }
    stdin.on('data', onData)
  })
}

// ---------- psql (SQL via stdin: passwords never appear in a process command line) ----------
const candidates = [process.env.PSQL, ...[17, 16, 15, 14].map((v) => `C:/Program Files/PostgreSQL/${v}/bin/psql.exe`)].filter(Boolean)
const psqlBin = candidates.find((c) => existsSync(c)) ?? (spawnSync('psql', ['--version']).error ? null : 'psql')
let adminPassword = ''

function psql(sql, db = 'postgres') {
  const r = spawnSync(psqlBin, ['-h', HOST, '-p', PORT, '-U', 'postgres', '-d', db, '-X', '-w', '-q', '-v', 'ON_ERROR_STOP=1', '-tA'], {
    input: sql,
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^PG/i.test(k))), PGPASSWORD: adminPassword },
    encoding: 'utf8',
  })
  const reason = r.error
    ? `could not start psql (${r.error.code ?? r.error.message})`
    : r.signal
      ? `psql was killed (${r.signal})`
      : scrub((r.stderr ?? '').trim()) || `psql exited with code ${r.status} and no message`
  return { ok: r.status === 0 && !r.error, out: (r.stdout ?? '').trim(), err: reason }
}
const lit = (value) => `'${String(value).replace(/'/g, "''")}'`

// ---------- URL building and validation ----------
const buildUrl = (db, password) => `postgresql://${encodeURIComponent(ROLE)}:${encodeURIComponent(password)}@${HOST}:${PORT}/${db}?schema=public`

function setEnvLine(file, key, value) {
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const re = new RegExp(`^${key}=.*$`, 'm')
  const line = `${key}=${value}`
  writeFileSync(file, re.test(text) ? text.replace(re, () => line) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`)
}

// =====================================================================================
console.log('ReadySet isolated database setup\n')
if (!psqlBin) stop('psql was not found. Install the PostgreSQL command-line tools or set PSQL to the full path of psql.exe.')
if (!SETUP_HOSTS.includes(HOST) || !ALLOWED_PORTS.includes(PORT)) {
  stop(`Refusing to use server ${HOST}:${PORT}. Only a local PostgreSQL is allowed: host ${SETUP_HOSTS.join(' or ')}, port ${ALLOWED_PORTS.join(' or ')}. Check the PGHOST / PGPORT environment variables in this terminal. Nothing was contacted.`)
}
if (process.env.PGHOST || process.env.PGPORT) console.log(`Note: using PGHOST/PGPORT from this terminal: ${HOST}:${PORT}`)
if (new Set(Object.values(DB)).size !== 3) stop('Internal error: database names are not distinct.')

adminPassword = await askHidden(`PostgreSQL administrator ("postgres") password for ${HOST}:${PORT}: `)
secrets.add(adminPassword)
console.log('password received: yes')

// ---- Phase 1: read-only inspection of ALL FOUR names ----
console.log('\nInspecting (read-only)...')
const login = psql('select 1')
if (!login.ok) stop(`Could not log in as "postgres": ${login.err}`, { failedStep: 'log in as postgres' })
done('logged in as postgres')

const findings = []
const role = psql(`select 1 from pg_roles where rolname = ${lit(ROLE)}`)
if (!role.ok) stop(`Could not inspect roles: ${role.err}`, { failedStep: 'inspect role' })
if (role.out) findings.push(`role ${ROLE} already exists`)
for (const db of Object.values(DB)) {
  const row = psql(`select r.rolname from pg_database d join pg_roles r on r.oid = d.datdba where d.datname = ${lit(db)}`)
  if (!row.ok) stop(`Could not inspect database ${db}: ${row.err}`, { failedStep: `inspect ${db}` })
  if (row.out) findings.push(`database ${db} already exists (owner=${row.out})`)
}
done('inspected all four names')

if (findings.length) {
  console.error('\nSTOP. These ReadySet isolated resources already exist:')
  for (const f of findings) console.error(`  - ${f}`)
  console.error('\nThe script never adopts, modifies or reuses existing resources. Nothing was changed.\nSee README "Partial-failure recovery" for what to do.')
  steps.push({ name: 'create role and databases (stopped: names already in use)', status: 'skipped' })
  summary()
  process.exit(2)
}

// ---- Phase 2: create (all four names are confirmed free) ----
console.log('\nCreating...')
const appPassword = randomBytes(18).toString('hex')
secrets.add(appPassword)
const urls = { dev: buildUrl(DB.dev, appPassword), test: buildUrl(DB.test, appPassword), shadow: buildUrl(DB.shadow, appPassword) }
{
  const problems = [
    ...validateUrls('dev', { DATABASE_URL: urls.dev, SHADOW_DATABASE_URL: urls.shadow }),
    ...validateUrls('test', { DATABASE_URL: urls.test, SHADOW_DATABASE_URL: urls.shadow }),
  ]
  if (problems.length) stop(`Connection URL validation failed before creating anything:\n${[...new Set(problems)].map((p) => `  - ${p}`).join('\n')}`,{ failedStep: 'validated connection URLs' })
}
{
  const hostPort = new Set(Object.values(urls).map((x) => { const u = new URL(x); return `${u.hostname}:${u.port}` }))
  if (hostPort.size !== 1) stop('The dev, test and shadow URLs must all target the same server.', { failedStep: 'validated connection URLs' })
}
done('validated connection URLs (protocol, host, port, user, database; shadow is exactly ' + DB.shadow + ' on the same server)')

let r = psql(`CREATE ROLE ${ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD ${lit(appPassword)};`)
if (!r.ok) stop(`Could not create role ${ROLE}: ${r.err}`, { failedStep: `created role ${ROLE}` })
done(`created role ${ROLE} (login only; no superuser/createdb/createrole/replication)`)

for (const db of Object.values(DB)) {
  r = psql(`CREATE DATABASE ${db} OWNER ${ROLE};`)
  if (!r.ok) stop(`Could not create database ${db}: ${r.err}`, { failedStep: `created database ${db}` })
  done(`created database ${db} (owner ${ROLE})`)
  // Explicit privileges, only inside the database we just created.
  r = psql(`REVOKE ALL ON DATABASE ${db} FROM PUBLIC; GRANT CONNECT, TEMPORARY ON DATABASE ${db} TO ${ROLE};`)
  if (!r.ok) stop(`Could not set database privileges on ${db}: ${r.err}`, { failedStep: `granted database privileges on ${db}` })
  r = psql(`REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT USAGE, CREATE ON SCHEMA public TO ${ROLE};`, db)
  if (!r.ok) stop(`Could not set schema privileges on ${db}: ${r.err}`, { failedStep: `granted schema privileges on ${db}` })
  done(`granted explicit privileges on ${db} (PUBLIC revoked; ${ROLE} has CONNECT/TEMPORARY, schema USAGE/CREATE)`)
}

// ---- Phase 3: verify ownership of everything we created ----
const owners = psql(`select d.datname || '=' || r.rolname from pg_database d join pg_roles r on r.oid = d.datdba where d.datname in (${Object.values(DB).map(lit).join(',')}) order by 1`)
const expected = Object.values(DB).map((d) => `${d}=${ROLE}`).sort().join('\n')
if (!owners.ok || owners.out.replace(/\r/g, '') !== expected) stop('Ownership check failed: not all three databases are owned by the isolated role.', { failedStep: 'verified database owners' })
done('verified: all three databases are owned by the isolated role')

// ---- Phase 4: env files (gitignored). Written before migrating so the password is never lost. ----
const envFile = path.join(backend, '.env')
const envTest = path.join(backend, '.env.test')
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const backups = []
try {
  for (const f of [envFile, envTest]) if (existsSync(f)) { copyFileSync(f, `${f}.backup-${stamp}`); backups.push(`${path.basename(f)}.backup-${stamp}`) }
  if (!existsSync(envFile)) copyFileSync(path.join(backend, '.env.example'), envFile)
  if (!existsSync(envTest)) copyFileSync(path.join(backend, '.env.test.example'), envTest)
  setEnvLine(envFile, 'DATABASE_URL', urls.dev)
  setEnvLine(envFile, 'SHADOW_DATABASE_URL', urls.shadow)
  setEnvLine(envTest, 'DATABASE_URL', urls.test)
} catch (err) {
  stop(`The role and databases exist, but writing the env files failed (${err.code ?? err.name}). Set DATABASE_URL / SHADOW_DATABASE_URL manually (README recovery section).`, { failedStep: 'wrote env files' })
}
done('wrote DATABASE_URL + SHADOW_DATABASE_URL to backend/.env and DATABASE_URL to backend/.env.test (gitignored; only those lines changed)')

// ---- Phase 5: migrations. ONLY `prisma migrate deploy`, with an explicit, validated URL per database. ----
const prismaCli = path.join(backend, 'node_modules', 'prisma', 'build', 'index.js')
if (!existsSync(prismaCli)) stop('The Prisma CLI is not installed. Run: npm run setup:api, then: npm --prefix backend run db:deploy', { failedStep: 'applied migrations' })
for (const key of ['dev', 'test']) {
  // Re-read the env file from disk and re-validate immediately before each Prisma command (never trust memory or the parent shell).
  const guard = guardedEnv(key === 'test' ? 'test' : 'deploy', backend)
  if (guard.problems.length) stop(`Refusing to run migrations for ${DB[key]}:\n${guard.problems.map((x) => `  - ${x}`).join('\n')}`,{ failedStep: `validated env before migrating ${DB[key]}` })
  const childEnv = guard.env
  const m = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: backend, env: childEnv, encoding: 'utf8' })
  if (m.status !== 0) {
    stop(`Migrations failed for ${DB[key]}. Last lines of output:\n${scrub((m.stdout + m.stderr).trim().split('\n').slice(-6).join('\n'))}`, { failedStep: `applied migrations to ${DB[key]}` })
  }
  done(`applied migrations to ${DB[key]}`)
}

summary()
console.log('\nDone. Restart the API (npm run dev:api) and try creating an account.')
