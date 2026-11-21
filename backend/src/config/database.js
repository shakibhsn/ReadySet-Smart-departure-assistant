// env.js MUST be imported before @prisma/client: importing the generated client loads backend/.env into
// process.env, which would otherwise look like a shell-set DATABASE_URL (or hide a real one) to the isolation guard.
import { env } from './env.js'
import { Prisma, PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
})

/**
 * True when the GENERATED client knows this column. Columns added by a pending migration are only used when
 * the client was regenerated for them, so code written ahead of a migration can never break existing endpoints
 * (the client is regenerated only together with the migration; see docs/MIGRATION_READINESS.md).
 */
export const supportsField = (model, field) => Boolean(Prisma[`${model}ScalarFieldEnum`]?.[field])
