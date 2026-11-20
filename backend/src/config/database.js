// env.js MUST be imported before @prisma/client: importing the generated client loads backend/.env into
// process.env, which would otherwise look like a shell-set DATABASE_URL (or hide a real one) to the isolation guard.
import { env } from './env.js'
import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
})
