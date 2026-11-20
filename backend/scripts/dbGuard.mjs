// Safety guard for every Prisma migration command (used by setup-local-db.mjs and prisma-safe.mjs).
// It re-reads the env FILE each time (never trusts that .env is unchanged since setup), validates every
// connection URL component, and never corrects, rewrites or prints a URL. Pure: no database connection.
import { existsSync, readFileSync } from 'node:fs'

export const ROLE = 'readyset_isolated_app'
export const EXPECTED = { dev: 'readyset_isolated_dev', test: 'readyset_isolated_test', shadow: 'readyset_isolated_shadow' }
// Explicit allowlist: only a local PostgreSQL on its default port (5432) or the common alternate (5433).
export const ALLOWED_HOSTS = ['localhost', '127.0.0.1']
export const ALLOWED_PORTS = ['5432', '5433']
const LOCAL_HOSTS = new Set([...ALLOWED_HOSTS, '[::1]'])
const CONNECTION_VARS = /^(DATABASE_URL|SHADOW_DATABASE_URL|DIRECT_URL|TEST_DATABASE_URL|PG(HOST|PORT|USER|PASSWORD|DATABASE|SERVICE)|PRISMA_.*URL)$/i

export function parseEnvText(text) {
  const out = {}
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

/** Returns a list of problems (names of components only, never values). Empty list = valid. */
export function checkUrl(label, raw, expectedDb) {
  if (!raw) return [`${label} is missing`]
  let u
  try { u = new URL(raw) } catch { return [`${label} is not a valid URL`] }
  const problems = []
  if (!['postgresql:', 'postgres:'].includes(u.protocol)) problems.push(`${label}: protocol must be postgresql`)
  if (!LOCAL_HOSTS.has(u.hostname)) problems.push(`${label}: host must be the local server (localhost, 127.0.0.1 or ::1)`)
  if (!ALLOWED_PORTS.includes(u.port)) problems.push(`${label}: port must be one of ${ALLOWED_PORTS.join(', ')} (explicit)`)
  if (decodeURIComponent(u.username) !== ROLE) problems.push(`${label}: user must be ${ROLE}`)
  if (decodeURIComponent(u.pathname.slice(1)) !== expectedDb) problems.push(`${label}: database must be exactly ${expectedDb}`)
  return problems
}

/**
 * mode 'dev'    : DATABASE_URL -> dev, SHADOW_DATABASE_URL -> shadow (both required; `migrate dev`)
 * mode 'deploy' : DATABASE_URL -> dev; SHADOW optional but validated if present
 * mode 'test'   : DATABASE_URL -> test; SHADOW optional but validated if present
 */
export function validateUrls(mode, values) {
  const main = mode === 'test' ? EXPECTED.test : EXPECTED.dev
  const problems = [...checkUrl('DATABASE_URL', values.DATABASE_URL, main)]
  if (mode === 'dev' || values.SHADOW_DATABASE_URL) problems.push(...checkUrl('SHADOW_DATABASE_URL', values.SHADOW_DATABASE_URL, EXPECTED.shadow))
  if (!problems.length && values.SHADOW_DATABASE_URL) {
    const hp = (x) => { const u = new URL(x); return `${u.hostname}:${u.port}` }
    if (hp(values.DATABASE_URL) !== hp(values.SHADOW_DATABASE_URL)) problems.push('DATABASE_URL and SHADOW_DATABASE_URL must use the same server (host and port)')
  }
  return problems
}

/**
 * Reads the env file(s) from disk, validates, and builds the child environment for a Prisma command:
 * the parent environment with ALL connection variables removed, then only the validated values set.
 * `envDir` holds .env / .env.test. Returns { problems, env }.
 */
export function guardedEnv(mode, envDir, parentEnv = process.env) {
  const file = (name) => {
    const p = `${envDir}/${name}`
    return existsSync(p) ? parseEnvText(readFileSync(p, 'utf8')) : null
  }
  const main = file(mode === 'test' ? '.env.test' : '.env')
  if (!main) return { problems: [`backend/${mode === 'test' ? '.env.test' : '.env'} does not exist`], env: null }
  const values = { DATABASE_URL: main.DATABASE_URL, SHADOW_DATABASE_URL: main.SHADOW_DATABASE_URL }
  if (mode === 'test' && !values.SHADOW_DATABASE_URL) {
    // Prisma also loads backend/.env itself; make sure whatever shadow URL it could pick up is validated too.
    const dev = file('.env')
    if (dev?.SHADOW_DATABASE_URL) values.SHADOW_DATABASE_URL = dev.SHADOW_DATABASE_URL
  } else if (mode === 'test') {
    const dev = file('.env')
    if (dev?.SHADOW_DATABASE_URL && dev.SHADOW_DATABASE_URL !== values.SHADOW_DATABASE_URL) return { problems: ['SHADOW_DATABASE_URL differs between .env and .env.test (they must match, or be defined in only one file)'], env: null }
  }
  const problems = validateUrls(mode, values)
  if (problems.length) return { problems, env: null }
  const env = {}
  for (const [k, v] of Object.entries(parentEnv)) if (!CONNECTION_VARS.test(k)) env[k] = v
  env.DATABASE_URL = values.DATABASE_URL
  if (values.SHADOW_DATABASE_URL) env.SHADOW_DATABASE_URL = values.SHADOW_DATABASE_URL
  return { problems: [], env }
}

/**
 * Runtime isolation check for the API and the tests (called from src/config/env.js after dotenv ran).
 * development: DATABASE_URL must be readyset_isolated_dev; test: readyset_isolated_test (any other database is
 * rejected, even if its name ends in _test). production is exempt (its database is deployment-specific).
 * A variable set in the shell that differs from the env file is never silently preferred: it is refused.
 * Returns problems (names only, never values).
 */
export function checkRuntime({ nodeEnv, databaseUrl, shellDatabaseUrl, fileDatabaseUrl, shadowUrl, present = [] }) {
  if (nodeEnv === 'production') return []
  const problems = checkUrl('DATABASE_URL', databaseUrl, nodeEnv === 'test' ? EXPECTED.test : EXPECTED.dev)
  if (shellDatabaseUrl && fileDatabaseUrl && shellDatabaseUrl !== fileDatabaseUrl) {
    problems.push('DATABASE_URL is set in this terminal/environment and differs from the env file; unset it (the API never silently picks one)')
  }
  if (shadowUrl) problems.push(...checkUrl('SHADOW_DATABASE_URL', shadowUrl, EXPECTED.shadow))
  for (const name of present) problems.push(`${name} is set but ReadySet does not use it; unset it so it cannot be mistaken for a ReadySet setting`)
  return problems
}
