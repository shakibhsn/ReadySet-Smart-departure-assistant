import { DateTime } from 'luxon'
import { z } from 'zod'
import { GRANULARITIES, MAX_RANGE_DAYS } from '../services/analytics/analyticsRules.js'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((s) => DateTime.fromISO(s).isValid, 'Not a real date')

export const analyticsQuerySchema = z
  .object({
    from: day.optional(),
    to: day.optional(), // inclusive
    granularity: z.enum(GRANULARITIES, { error: `granularity must be one of: ${GRANULARITIES.join(', ')}` }).default('week'),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { path: ['to'], message: 'to must not be before from' })
  .refine((v) => !v.from || !v.to || DateTime.fromISO(v.to).diff(DateTime.fromISO(v.from), 'days').days < MAX_RANGE_DAYS, { path: ['to'], message: `The range can be at most ${MAX_RANGE_DAYS} days` })

export const weekQuerySchema = z.object({ start: day.optional() })
