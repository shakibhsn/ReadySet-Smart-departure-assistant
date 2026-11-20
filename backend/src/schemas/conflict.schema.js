import { z } from 'zod'
import { isInstantString } from '../utils/timezone.js'
import { MAX_DAYS } from '../services/conflict/conflictRules.js'

export const conflictQuerySchema = z.object({
  days: z.coerce.number().int().min(1, 'days must be at least 1').max(MAX_DAYS, `days must be at most ${MAX_DAYS}`).default(14),
  from: z.string().refine(isInstantString, 'Use an ISO instant with Z/offset').transform((s) => new Date(s)).optional(),
})
