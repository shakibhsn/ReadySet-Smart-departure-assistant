// One-command local database setup:  npm run db:setup   (from the project root or backend/)
//
// Asks for your PostgreSQL "postgres" password (typed hidden, never stored or printed), then:
//  - creates the role readyset_app (or only resets ITS password if it already exists),
//  - creates the databases readyset_dev and readyset_test if they are missing,
//  - writes the matching DATABASE_URL into backend/.env and backend/.env.test (both gitignored),
//  - applies the migrations to both databases.
// It never drops, truncates or overwrites any database, and touches nothing outside those names.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOST = process.env.PGHOST ?? 'localhost'
const PORT = process.env.PGPORT ?? '5432'
const ROLE = 'readyset_app'
const DBS = ['readyset_dev', 'readyset_test']

const candidates = [process.env.PSQL, 'C:/Program Files/PostgreSQL/17/bin/psql.exe', 'C:/Program Files/PostgreSQL/16/bin/psql.exe', 'C:/Program Files/PostgreSQL/15/bin/psql.exe', 'psql'].filter(Boolean)
const psqlBin = candidates.find((c) => c === 'psql' || existsSync(c))

function ask(question) {
  return new Promise((resolve) => {
    process.stdout.write(question)
    const stdin = process.stdin
    let value = ''
    stdin.setRawMode?.(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n' || c === '\u0004') {
          stdin.setRawMode?.(false)
          stdin.pause()
          stdin.off('data', onData)
          process.stdout.write('\n')
          return resolve(value)
        }
        if (c === '\u0003') process.exit(1)
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1)
        else value += c
      }
    }
    stdin.on('data', onData)
  })
}

function psql(password, sql, db = 'postgres') {
  const r = spawnSync(psqlBin, ['-h', HOST, '-p', PORT, '-U', 'postgres', '-d', db, '-X', '-w', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', sql], {
    env: { ...process.env, PGPASSWORD: password },
    encoding: 'utf8',
  })
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() }
}

function setEnvLine(file, key, value) {
  const line = `${key}=${value}`
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const re = new RegExp(`^${key}=.*$`, 'm')
  writeFileSync(file, re.test(text) ? text.replace(re, () => line) : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`)
}

if (!psqlBin) {
  console.error('psql was not found. Install the PostgreSQL command-line tools or set PSQL to the path of psql.exe.')
  process.exit(1)
}

const adminPassword = await ask(`PostgreSQL "postgres" user password (${HOST}:${PORT}): `)
const probe = psql(adminPassword, 'select 1')
if (!probe.ok) {
  console.error(`\nCould not log in as "postgres": ${probe.err.split('\n')[0]}\nNothing was changed. Check the password and that PostgreSQL is running.`)
  process.exit(1)
}

// Random URL-safe password: no characters that need URL-encoding.
const appPassword = randomBytes(18).toString('hex')

const roleExists = psql(adminPassword, `select 1 from pg_roles where rolname='${ROLE}'`).out === '1'
const roleSql = roleExists ? `ALTER ROLE ${ROLE} LOGIN PASSWORD '${appPassword}' CREATEDB` : `CREATE ROLE ${ROLE} LOGIN PASSWORD '${appPassword}' CREATEDB`
let r = psql(adminPassword, roleSql)
if (!r.ok) {
  console.error(`Could not set up role ${ROLE}: ${r.err.split('\n')[0].replace(appPassword, '***')}`)
  process.exit(1)
}
console.log(roleExists ? `Role ${ROLE} already existed: only its password was reset.` : `Created role ${ROLE}.`)

for (const db of DBS) {
  if (psql(adminPassword, `select 1 from pg_database where datname='${db}'`).out === '1') {
    console.log(`Database ${db} already exists: left untouched.`)
    continue
  }
  r = psql(adminPassword, `CREATE DATABASE ${db} OWNER ${ROLE}`)
  if (!r.ok) {
    console.error(`Could not create ${db}: ${r.err.split('\n')[0]}`)
    process.exit(1)
  }
  console.log(`Created database ${db}.`)
}

const url = (db) => `postgresql://${ROLE}:${appPassword}@${HOST}:${PORT}/${db}?schema=public`
setEnvLine(path.join(backend, '.env'), 'DATABASE_URL', url('readyset_dev'))
setEnvLine(path.join(backend, '.env.test'), 'DATABASE_URL', url('readyset_test'))
console.log('Wrote DATABASE_URL to backend/.env and backend/.env.test (gitignored).')

const prisma = path.join(backend, 'node_modules', 'prisma', 'build', 'index.js')
for (const [label, envFile] of [['readyset_dev', '.env'], ['readyset_test', '.env.test']]) {
  const m = spawnSync(process.execPath, [`--env-file=${path.join(backend, envFile)}`, prisma, 'migrate', 'deploy'], { cwd: backend, encoding: 'utf8' })
  console.log(m.status === 0 ? `Migrations applied to ${label}.` : `Migration FAILED for ${label}:\n${(m.stdout + m.stderr).split('\n').slice(-8).join('\n')}`)
  if (m.status !== 0) process.exit(1)
}
console.log('\nDone. Restart the API (npm run dev:api) and try creating an account again.')
