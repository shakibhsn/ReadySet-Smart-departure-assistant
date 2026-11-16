import dotenv from 'dotenv'
import { z } from 'zod'

// Tests load .env.test so they can never pick up the development database by accident.
dotenv.config({
  path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
  quiet: true,
})

// Empty values in a .env file ("KEY=") count as "not set".
const blank = (s) => z.preprocess((v) => (v === '' ? undefined : v), s)
const flag = z.enum(['true', 'false']).default('false').transform((v) => v === 'true')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  DATABASE_URL: z
    .string()
    .min(1, 'is required')
    .refine((v) => /^postgres(ql)?:\/\//.test(v), 'must be a postgresql:// URL'),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^[1-9]\d*(s|m|h|d|w)$/, 'must look like 15m, 12h or 1d')
    .default('1d'),
  FRONTEND_URL: z.url('must be a valid URL, e.g. http://localhost:5173'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  // ---- Email (see README "Email system") ----
  EMAIL_PROVIDER: blank(z.enum(['resend']).default('resend')),
  // console = print a preview, never send. provider = really send through EMAIL_PROVIDER.
  EMAIL_MODE: blank(z.enum(['console', 'provider']).default('console')),
  RESEND_API_KEY: blank(z.string().min(10).optional()),
  EMAIL_FROM: blank(z.email('must be a plain email address such as no-reply@mail.example.com').optional()),
  EMAIL_FROM_NAME: blank(z.string().min(1).max(60).default('ReadySet')),
  // Base URL used in links inside emails (the FRONTEND). Defaults to FRONTEND_URL.
  APP_BASE_URL: blank(z.url('must be a valid URL').optional()),
  SUPPORT_EMAIL: blank(z.email().optional()),
  EMAIL_VERIFICATION_REQUIRED: blank(flag),
  EMAIL_REMINDERS_ENABLED: blank(flag),
})

/** Name of the database inside a postgres URL (never log the rest of the URL: it has the password). */
export const databaseNameOf = (url) => {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
  } catch {
    return ''
  }
}

function loadEnv() {
  const result = schema.safeParse(process.env)
  if (!result.success) {
    // Print variable names and reasons only, never values.
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`)
    console.error(`Invalid or missing environment configuration:\n${lines.join('\n')}`)
    console.error('Copy backend/.env.example to backend/.env and fill in the values.')
    process.exit(1)
  }
  const env = result.data

  // Safety net: automated tests delete rows, so they may only touch a "*_test" database.
  if (env.NODE_ENV === 'test' && !databaseNameOf(env.DATABASE_URL).endsWith('_test')) {
    console.error('Refusing to run tests: the database name in .env.test must end with "_test".')
    process.exit(1)
  }
  // ---- Email configuration safety checks (names only, never values) ----
  const emailProblems = []
  if (env.EMAIL_MODE === 'provider') {
    if (!env.RESEND_API_KEY) emailProblems.push('RESEND_API_KEY is required when EMAIL_MODE=provider')
    if (!env.EMAIL_FROM) emailProblems.push('EMAIL_FROM is required when EMAIL_MODE=provider')
  }
  if (env.NODE_ENV === 'production' && env.EMAIL_MODE !== 'provider') {
    emailProblems.push('EMAIL_MODE must be "provider" in production (console mode would silently drop every email)')
  }
  if (env.NODE_ENV === 'test' && env.EMAIL_MODE === 'provider') {
    emailProblems.push('EMAIL_MODE=provider is not allowed in tests (automated tests must never send real email)')
  }
  if (emailProblems.length > 0) {
    console.error(`Invalid email configuration:\n${emailProblems.map((p) => `  - ${p}`).join('\n')}`)
    process.exit(1)
  }

  return Object.freeze({ ...env, APP_BASE_URL: (env.APP_BASE_URL ?? env.FRONTEND_URL).replace(/\/$/, '') })
}

export const env = loadEnv()
