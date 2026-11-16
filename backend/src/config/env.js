import dotenv from 'dotenv'
import { z } from 'zod'

// Tests load .env.test so they can never pick up the development database by accident.
dotenv.config({
  path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
  quiet: true,
})

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z
    .string()
    .min(1, 'is required')
    .refine((v) => /^postgres(ql)?:\/\//.test(v), 'must be a postgresql:// URL'),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().min(1).default('1d'),
  FRONTEND_URL: z.url('must be a valid URL, e.g. http://localhost:5173'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
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
  return Object.freeze(env)
}

export const env = loadEnv()
