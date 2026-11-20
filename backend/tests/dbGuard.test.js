import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkRuntime, checkUrl, guardedEnv, parseEnvText, validateUrls } from '../scripts/dbGuard.mjs'

const url = (db, { user = 'readyset_isolated_app', host = 'localhost', port = '5432', proto = 'postgresql' } = {}) => `${proto}://${user}:PLACEHOLDER@${host}:${port}/${db}?schema=public`
const DEV = url('readyset_isolated_dev')
const SHADOW = url('readyset_isolated_shadow')
const TEST = url('readyset_isolated_test')

describe('checkUrl: every component is validated', () => {
  it('accepts the exact intended URL', () => expect(checkUrl('X', DEV, 'readyset_isolated_dev')).toEqual([]))
  it.each([
    ['protocol', url('readyset_isolated_dev', { proto: 'mysql' }), /protocol/],
    ['host', url('readyset_isolated_dev', { host: 'db.example.com' }), /host/],
    ['port (missing)', 'postgresql://readyset_isolated_app:p@localhost/readyset_isolated_dev', /port/],
    ['port (not in the allowlist)', url('readyset_isolated_dev', { port: '5999' }), /port must be one of/],
    ['user', url('readyset_isolated_dev', { user: 'postgres' }), /user/],
    ['database (other project)', url('fydp_database'), /database must be exactly/],
    ['database (old ReadySet name)', url('readyset_dev'), /database must be exactly/],
    ['database (shadow where dev expected)', SHADOW, /database must be exactly/],
  ])('rejects a wrong %s', (_label, bad, pattern) => {
    expect(checkUrl('X', bad, 'readyset_isolated_dev').join(' ')).toMatch(pattern)
  })
  it('rejects missing and malformed values', () => {
    expect(checkUrl('X', undefined, 'a')).toEqual(['X is missing'])
    expect(checkUrl('X', 'not a url', 'a')).toEqual(['X is not a valid URL'])
  })
  it('never echoes a URL or password in problems', () => {
    expect(JSON.stringify(checkUrl('X', url('other'), 'readyset_isolated_dev'))).not.toContain('PLACEHOLDER')
  })
})

describe('validateUrls by mode', () => {
  it('dev needs dev + shadow', () => {
    expect(validateUrls('dev', { DATABASE_URL: DEV, SHADOW_DATABASE_URL: SHADOW })).toEqual([])
    expect(validateUrls('dev', { DATABASE_URL: DEV })).toContain('SHADOW_DATABASE_URL is missing')
    expect(validateUrls('dev', { DATABASE_URL: TEST, SHADOW_DATABASE_URL: SHADOW }).join()).toMatch(/readyset_isolated_dev/)
    expect(validateUrls('dev', { DATABASE_URL: DEV, SHADOW_DATABASE_URL: DEV }).join()).toMatch(/readyset_isolated_shadow/)
  })
  it('deploy: shadow optional but validated if present', () => {
    expect(validateUrls('deploy', { DATABASE_URL: DEV })).toEqual([])
    expect(validateUrls('deploy', { DATABASE_URL: DEV, SHADOW_DATABASE_URL: url('someone_else') }).join()).toMatch(/SHADOW/)
  })
  it('test must target the test database only', () => {
    expect(validateUrls('test', { DATABASE_URL: TEST })).toEqual([])
    expect(validateUrls('test', { DATABASE_URL: DEV }).join()).toMatch(/readyset_isolated_test/)
  })
  it('all URLs must use the same server', () => {
    expect(validateUrls('dev', { DATABASE_URL: DEV, SHADOW_DATABASE_URL: url('readyset_isolated_shadow', { port: '5433' }) }).join()).toMatch(/same server/)
  })
})

describe('guardedEnv reads the files on disk and builds a clean child environment', () => {
  const dir = (files) => {
    const d = mkdtempSync(path.join(tmpdir(), 'rs-guard-'))
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(d, name), text)
    return d
  }
  const parent = { PATH: 'x', DATABASE_URL: url('fydp_database'), SHADOW_DATABASE_URL: url('fydp_shadow'), PGHOST: 'elsewhere', PRISMA_MIGRATE_URL: 'x' }

  it('ignores inherited connection variables from another project and uses only the file values', () => {
    const d = dir({ '.env': `DATABASE_URL=${DEV}\nSHADOW_DATABASE_URL=${SHADOW}\n` })
    const { problems, env } = guardedEnv('dev', d, parent)
    expect(problems).toEqual([])
    expect(env.DATABASE_URL).toBe(DEV)
    expect(env.SHADOW_DATABASE_URL).toBe(SHADOW)
    expect(env.PATH).toBe('x')
    expect(env.PGHOST).toBeUndefined()
    expect(env.PRISMA_MIGRATE_URL).toBeUndefined()
  })
  it('fails (and does not correct) when .env was hand-edited to another database', () => {
    const d = dir({ '.env': `DATABASE_URL=${url('fydp_database')}\nSHADOW_DATABASE_URL=${SHADOW}\n` })
    const r = guardedEnv('dev', d, parent)
    expect(r.env).toBeNull()
    expect(r.problems.join()).toMatch(/DATABASE_URL: database must be exactly readyset_isolated_dev/)
  })
  it('fails when the env file is missing', () => {
    expect(guardedEnv('dev', dir({}), parent).problems[0]).toMatch(/does not exist/)
  })
  it('test mode: no shadow needed, but a shadow Prisma could pick up from .env is validated', () => {
    const ok = guardedEnv('test', dir({ '.env.test': `DATABASE_URL=${TEST}\n`, '.env': `DATABASE_URL=${DEV}\nSHADOW_DATABASE_URL=${SHADOW}\n` }), parent)
    expect(ok.problems).toEqual([])
    const bad = guardedEnv('test', dir({ '.env.test': `DATABASE_URL=${TEST}\n`, '.env': `SHADOW_DATABASE_URL=${url('fydp_shadow')}\n` }), parent)
    expect(bad.problems.join()).toMatch(/SHADOW/)
  })
  it('test mode: a shadow URL that differs between .env and .env.test is refused', () => {
    const d = dir({ '.env.test': `DATABASE_URL=${TEST}
SHADOW_DATABASE_URL=${SHADOW}
`, '.env': `SHADOW_DATABASE_URL=${url('readyset_isolated_shadow', { port: '5433' })}
` })
    expect(guardedEnv('test', d, parent).problems.join()).toMatch(/differs between/)
  })
  it('parses quotes and comments', () => {
    expect(parseEnvText('# c\nA="x y"\nB=z\n#C=1')).toEqual({ A: 'x y', B: 'z' })
  })
})

describe('checkRuntime (API and tests)', () => {
  it('development: isolated dev URL passes; test: isolated test URL passes', () => {
    expect(checkRuntime({ nodeEnv: 'development', databaseUrl: DEV })).toEqual([])
    expect(checkRuntime({ nodeEnv: 'test', databaseUrl: TEST })).toEqual([])
  })
  it('rejects another project database, even one named *_test', () => {
    expect(checkRuntime({ nodeEnv: 'development', databaseUrl: url('fydp_database') }).join()).toMatch(/exactly readyset_isolated_dev/)
    expect(checkRuntime({ nodeEnv: 'test', databaseUrl: url('fydp_test') }).join()).toMatch(/exactly readyset_isolated_test/)
  })
  it('rejects remote host, wrong user, missing and malformed URLs', () => {
    expect(checkRuntime({ nodeEnv: 'development', databaseUrl: url('readyset_isolated_dev', { host: 'db.example.com' }) }).join()).toMatch(/host/)
    expect(checkRuntime({ nodeEnv: 'development', databaseUrl: url('readyset_isolated_dev', { user: 'postgres' }) }).join()).toMatch(/user/)
    expect(checkRuntime({ nodeEnv: 'development' })).toEqual(['DATABASE_URL is missing'])
    expect(checkRuntime({ nodeEnv: 'development', databaseUrl: '%%%' })).toEqual(['DATABASE_URL is not a valid URL'])
  })
  it('a shell value that differs from the env file is refused, even if valid', () => {
    const other = url('readyset_isolated_dev', { port: '5433' })
    expect(checkRuntime({ nodeEnv: 'development', databaseUrl: other, shellDatabaseUrl: other, fileDatabaseUrl: DEV }).join()).toMatch(/differs from the env file/)
    expect(checkRuntime({ nodeEnv: 'development', databaseUrl: DEV, shellDatabaseUrl: DEV, fileDatabaseUrl: DEV })).toEqual([])
  })
  it('production is exempt from the exact-name rule', () => {
    expect(checkRuntime({ nodeEnv: 'production', databaseUrl: url('anything') })).toEqual([])
  })
})
