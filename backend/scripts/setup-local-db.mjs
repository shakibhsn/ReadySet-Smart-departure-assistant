// One-command local database setup:  npm run db:setup   (from the project root or backend/)
//
// SAFETY MODEL
//  1. Read-only inspection first. Only if the role AND both databases are absent does it create anything.
//  2. If readyset_app, readyset_dev or readyset_test already exists, it STOPS and tells you what it saw.
//     It never resets a password, changes privileges, or runs migrations against something that already
//     existed. Inspect it yourself, then decide (it never drops, truncates or overwrites a database).
//  3. The new role is least-privilege: LOGIN only (no superuser, createdb, createrole, replication) and it
//     OWNS only the two new databases. Other roles are locked out of them (CONNECT revoked from PUBLIC).
//  4. Secrets are never printed. The postgres password is read hidden from an interactive terminal only.
//  5. If anything fails, a summary lists exactly what was completed, what failed and what was not attempted.
//     No automatic clean-up is ever attempted.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOST = process.env.PGHOST ?? 'localhost'
const PORT = process.env.PGPORT ?? '5432'
const ROLE = 'readyset_app'
const DEV_DB = 'readyset_dev'
const TEST_DB = 'readyset_test'

// ---------- progress reporting ----------
const steps = [] // { name, status: 'done' | 'failed' | 'skipped' }
const secrets = new Set()
const scrub = (text) => {
  let out = String(text ?? '')
  for (const s of secrets) if (s) out = out.split(s).join('***')
  return out.replace(/postgres(ql)?:\/\/\S+/gi, 'postgresql://***')
}
// Everything printed is also appended (scrubbed) to a gitignored log, so the result never depends on the terminal.
const logFile = path.join(backend, '.db-setup.log')
writeFileSync(logFile, `setup-local-db v5  ${new Date().toISOString()}\n`)
for (const method of ['log', 'error']) {
  const original = console[method].bind(console)
  console[method] = (...args) => {
    original(...args)
    try { appendFileSync(logFile, `${scrub(args.join(' '))}\n`) } catch { /* logging must never break setup */ }
  }
}
process.on('exit', (code) => console.log(`\n[setup-local-db v5] exit code ${code}. Full log: ${logFile}`))
console.log('setup-local-db v5')
const done = (name) => {
  steps.push({ name, status: 'done' })
  console.log(`  ok  ${name}`)
}
function summary() {
  console.log('\nSummary:')
  for (const s of steps) console.log(`  [${s.status}] ${s.name}`)
}
function stop(message, { failedStep } = {}) {
  if (failedStep) steps.push({ name: failedStep, status: 'failed' })
  console.error(`\n${scrub(message)}`)
  if (failedStep) console.error(`Failed step: ${failedStep} (server ${HOST}:${PORT}, psql: ${psqlBin ?? 'not found'})`)
  summary()
  const changed = steps.some((s) => s.status === 'done' && /^(created|restricted|wrote|applied)/.test(s.name))
  console.error(
    changed
      ? '\nSome changes WERE made (see "done" above). Nothing was cleaned up automatically. Inspect before re-running; the script will stop on the objects it already created.'
      : '\nNo database changes were made.',
  )
  process.exit(1)
}

// ---------- hidden password prompt (interactive terminals only) ----------
function askHidden(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
    stop('This script needs an interactive terminal so the password can be typed hidden. Run it directly in a terminal (not piped, redirected or from a non-interactive task runner).')
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
            // A stale Enter from launching the command is ignored; a real empty Enter re-prompts (max 3).
            if (Date.now() - shownAt < 200) continue
            if (++emptyTries >= 3) {
              restore()
              stop('No password was entered 3 times (typing is hidden, so nothing appears on screen). Run the command again and type or paste the postgres password, then press Enter.', { failedStep: 'read postgres password' })
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

// ---------- psql (SQL goes through stdin so no password ever appears in a process command line) ----------
const candidates = [process.env.PSQL, ...[17, 16, 15, 14].map((v) => `C:/Program Files/PostgreSQL/${v}/bin/psql.exe`), 'psql'].filter(Boolean)
const psqlBin = candidates.find((c) => c !== 'psql' && existsSync(c)) ?? (spawnSync('psql', ['--version']).error ? null : 'psql')
let adminPassword = ''

function psql(sql, db = 'postgres') {
  const r = spawnSync(psqlBin, ['-h', HOST, '-p', PORT, '-U', 'postgres', '-d', db, '-X', '-w', '-q', '-v', 'ON_ERROR_STOP=1', '-tA'], {
    input: sql,
    env: { ...process.env, PGPASSWORD: adminPassword },
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

// ---------- env files ----------
function setEnvLine(file, key, value) {
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const re = new RegExp(`^${key}=.*$`, 'm')
  const line = `${key}=${value}`
  writeFileSync(file, re.test(text) ? text.replace(re, () => line) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`)
}

// =====================================================================================
console.log('ReadySet local database setup\n')
if (!psqlBin) stop('psql was not found. Install the PostgreSQL command-line tools or set PSQL to the full path of psql.exe.')

adminPassword = await askHidden(`PostgreSQL "postgres" user password (${HOST}:${PORT}): `)
secrets.add(adminPassword)
console.log('password received: yes') // never prints the value or its length

// ---- Phase 1: read-only inspection (nothing is changed here) ----
console.log('\nInspecting (read-only)...')
const login = psql('select 1')
if (!login.ok) stop(`Could not log in as "postgres": ${login.err}`, { failedStep: 'log in as postgres' })
done('logged in as postgres')

const roleRow = psql(`select rolsuper::text || ',' || rolcreatedb::text || ',' || rolcreaterole::text from pg_roles where rolname = ${lit(ROLE)}`)
if (!roleRow.ok) stop(`Could not inspect roles: ${roleRow.err}`, { failedStep: 'inspect role' })

const findings = []
if (roleRow.out) {
  const [sup, cdb, crl] = roleRow.out.split(',')
  findings.push(`role ${ROLE} already exists (superuser=${sup}, createdb=${cdb}, createrole=${crl})`)
}
for (const db of [DEV_DB, TEST_DB]) {
  const row = psql(`select r.rolname from pg_database d join pg_roles r on r.oid = d.datdba where d.datname = ${lit(db)}`)
  if (!row.ok) stop(`Could not inspect database ${db}: ${row.err}`, { failedStep: `inspect ${db}` })
  if (!row.out) continue
  const objects = psql(`select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')`, db)
  findings.push(`database ${db} already exists (owner=${row.out}, application tables=${objects.ok ? objects.out : 'could not be read'})`)
}
done('inspected role and databases')

if (findings.length) {
  console.error('\nManual inspection required. Found existing objects with ReadySet\'s names:')
  for (const f of findings) console.error(`  - ${f}`)
  console.error(
    '\nThe script will not reset passwords, change privileges or run migrations against objects that already exist,\n' +
      'because they may belong to another project. Confirm they are yours, then either pick other names or set\n' +
      'DATABASE_URL in backend/.env yourself and run: npm --prefix backend run db:deploy',
  )
  steps.push({ name: 'create role and databases (stopped: names already in use)', status: 'skipped' })
  summary()
  console.error('\nNo database changes were made.')
  process.exit(2)
}

// ---- Phase 2: create (only reached when all three names are free) ----
console.log('\nCreating...')
const appPassword = randomBytes(18).toString('hex') // hex: no URL-encoding needed
secrets.add(appPassword)

let r = psql(`CREATE ROLE ${ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD ${lit(appPassword)};`)
if (!r.ok) stop(`Could not create role ${ROLE}: ${r.err}`, { failedStep: `created role ${ROLE}` })
done(`created role ${ROLE} (login only, no createdb/createrole/superuser)`)

for (const db of [DEV_DB, TEST_DB]) {
  r = psql(`CREATE DATABASE ${db} OWNER ${ROLE};`)
  if (!r.ok) stop(`Could not create database ${db}: ${r.err}`, { failedStep: `created database ${db}` })
  done(`created database ${db} (owned by ${ROLE})`)
  r = psql(`REVOKE ALL ON DATABASE ${db} FROM PUBLIC;`)
  if (!r.ok) stop(`Created ${db} but could not restrict public access: ${r.err}`, { failedStep: `restricted public access to ${db}` })
  done(`restricted ${db} to its owner`)
}

// ---- Phase 3: env files (written before migrating so the generated password is never lost) ----
const url = (db) => `postgresql://${ROLE}:${appPassword}@${HOST}:${PORT}/${db}?schema=public`
const envFile = path.join(backend, '.env')
const envTest = path.join(backend, '.env.test')
try {
  if (!existsSync(envFile)) copyFileSync(path.join(backend, '.env.example'), envFile)
  if (!existsSync(envTest)) copyFileSync(path.join(backend, '.env.test.example'), envTest) // keeps JWT_SECRET, EMAIL_MODE, etc.
  setEnvLine(envFile, 'DATABASE_URL', url(DEV_DB))
  setEnvLine(envTest, 'DATABASE_URL', url(TEST_DB))
} catch (err) {
  stop(`The role and databases exist, but writing the env files failed (${err.code ?? err.name}). Set the ${ROLE} password manually and DATABASE_URL in backend/.env and backend/.env.test.`, { failedStep: 'wrote env files' })
}
done('wrote DATABASE_URL to backend/.env and backend/.env.test (gitignored; only that line changed)')

// ---- Phase 4: migrations, with the exact intended URL passed explicitly ----
const prismaCli = path.join(backend, 'node_modules', 'prisma', 'build', 'index.js')
if (!existsSync(prismaCli)) stop('The Prisma CLI is not installed. Run: npm run setup:api, then: npm --prefix backend run db:deploy', { failedStep: 'applied migrations' })
for (const db of [DEV_DB, TEST_DB]) {
  // Start from the parent environment but REMOVE any inherited connection settings, then set ours.
  const childEnv = { ...process.env }
  for (const key of Object.keys(childEnv)) if (/^(DATABASE_URL|SHADOW_DATABASE_URL|DIRECT_URL|PG(HOST|PORT|USER|PASSWORD|DATABASE)|PRISMA_.*URL)/i.test(key)) delete childEnv[key]
  childEnv.DATABASE_URL = url(db)
  const m = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: backend, env: childEnv, encoding: 'utf8' })
  if (m.status !== 0) {
    stop(`Migrations failed for ${db}. The last lines of output:\n${scrub((m.stdout + m.stderr).trim().split('\n').slice(-6).join('\n'))}\n(Fix the cause, then run: npm --prefix backend run db:deploy)`, { failedStep: `applied migrations to ${db}` })
  }
  done(`applied migrations to ${db}`)
}

summary()
console.log('\nDone. Restart the API (npm run dev:api) and try creating an account again.')
