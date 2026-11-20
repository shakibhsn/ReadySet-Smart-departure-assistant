import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

// These tests run env.js in a CHILD process from an EMPTY directory (so the real backend/.env is never
// loaded) and never open a database connection: env.js only validates configuration.
const envModule = pathToFileURL(path.resolve('src/config/env.js')).href
const url = (db, { user = 'readyset_isolated_app', host = 'localhost', port = '5432' } = {}) => `postgresql://${user}:PLACEHOLDER@${host}:${port}/${db}?schema=public`
const DEV = url('readyset_isolated_dev')
const TEST = url('readyset_isolated_test')
const SHADOW = url('readyset_isolated_shadow')

function load(extra = {}, { file } = {}) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'rs-env-'))
  const nodeEnv = extra.NODE_ENV ?? 'development'
  if (file !== undefined) writeFileSync(path.join(cwd, nodeEnv === 'test' ? '.env.test' : '.env'), file)
  const base = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    DATABASE_URL: nodeEnv === 'test' ? TEST : DEV,
    JWT_SECRET: 'x'.repeat(40),
    FRONTEND_URL: 'http://localhost:5173',
    NODE_ENV: nodeEnv,
  }
  const env = { ...base, ...extra }
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k]
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(envModule)})`], { cwd, env, encoding: 'utf8' })
  return { status: r.status, stderr: r.stderr }
}
const PROD = { NODE_ENV: 'production', EMAIL_MODE: 'provider', RESEND_API_KEY: 're_placeholder_key', EMAIL_FROM: 'noreply@example.com' }

describe('env.js runtime database isolation (development)', () => {
  it('the isolated development URL passes', () => expect(load().status).toBe(0))
  it('another project\'s database is rejected', () => {
    const r = load({ DATABASE_URL: url('fydp_database') })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/database must be exactly readyset_isolated_dev/)
    expect(r.stderr).not.toContain('PLACEHOLDER')
  })
  it('the old ReadySet names are rejected', () => {
    expect(load({ DATABASE_URL: url('readyset_dev', { user: 'readyset_app' }) }).status).toBe(1)
  })
  it('the test database is rejected in development', () => expect(load({ DATABASE_URL: TEST }).status).toBe(1))
  it('a remote host is rejected', () => {
    const r = load({ DATABASE_URL: url('readyset_isolated_dev', { host: 'db.example.com' }) })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/host must be the local server/)
  })
  it('a port outside the allowlist is rejected', () => expect(load({ DATABASE_URL: url('readyset_isolated_dev', { port: '5999' }) }).status).toBe(1))
  it('the wrong username is rejected', () => {
    const r = load({ DATABASE_URL: url('readyset_isolated_dev', { user: 'postgres' }) })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/user must be readyset_isolated_app/)
  })
  it('missing and malformed URLs are rejected', () => {
    expect(load({ DATABASE_URL: undefined }).status).toBe(1)
    expect(load({ DATABASE_URL: 'not a url' }).status).toBe(1)
  })
  it('a shadow URL that is not exactly readyset_isolated_shadow is rejected; the right one passes', () => {
    expect(load({ SHADOW_DATABASE_URL: url('fydp_shadow') }).status).toBe(1)
    expect(load({ SHADOW_DATABASE_URL: SHADOW }).status).toBe(0)
  })
  it('unused foreign connection variables (DIRECT_URL, TEST_DATABASE_URL) are refused', () => {
    expect(load({ DIRECT_URL: url('fydp_database') }).stderr).toMatch(/DIRECT_URL is set/)
    expect(load({ TEST_DATABASE_URL: url('fydp_database') }).stderr).toMatch(/TEST_DATABASE_URL is set/)
  })
})

describe('env.js runtime database isolation (tests)', () => {
  it('the isolated test URL passes in test mode', () => expect(load({ NODE_ENV: 'test', EMAIL_MODE: 'console' }).status).toBe(0))
  it('another database is rejected even if its name ends in _test', () => {
    const r = load({ NODE_ENV: 'test', DATABASE_URL: url('fydp_test') })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/database must be exactly readyset_isolated_test/)
  })
  it('the development database is rejected in test mode', () => expect(load({ NODE_ENV: 'test', DATABASE_URL: DEV }).status).toBe(1))
})

describe('a parent-shell variable cannot silently redirect the API or the tests', () => {
  it('development: shell value pointing at another project loses nothing silently: it is refused', () => {
    const r = load({ DATABASE_URL: url('fydp_database') }, { file: `DATABASE_URL=${DEV}\n` })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/differs from the env file/)
  })
  it('test mode: same protection for .env.test', () => {
    const r = load({ NODE_ENV: 'test', DATABASE_URL: url('fydp_test') }, { file: `DATABASE_URL=${TEST}\n` })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/differs from the env file/)
  })
  it('even another VALID isolated URL that differs from the file is refused (never a silent choice)', () => {
    const r = load({ DATABASE_URL: url('readyset_isolated_dev', { port: '5433' }) }, { file: `DATABASE_URL=${DEV}\n` })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/differs from the env file/)
  })
  it('a shell value identical to the file is fine', () => {
    expect(load({}, { file: `DATABASE_URL=${DEV}\n` }).status).toBe(0)
  })
})

describe('env.js SHADOW_DATABASE_URL production guard', () => {
  it('production + SHADOW_DATABASE_URL present: refuses to start', () => {
    const r = load({ ...PROD, SHADOW_DATABASE_URL: SHADOW })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/SHADOW_DATABASE_URL must not be set in production/)
    expect(r.stderr).not.toContain('PLACEHOLDER')
  })
  it('production without it: the guard does not trigger', () => {
    expect(load(PROD).stderr).not.toMatch(/SHADOW_DATABASE_URL/)
  })
})
