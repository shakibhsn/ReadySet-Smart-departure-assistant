import { z } from 'zod'
import { CATEGORY_KEYS, DEFAULT_RADIUS_M, MAX_RADIUS_M, MIN_RADIUS_M } from '../services/explore/nearbyHelpers.js'

// Query-string numbers must really be numbers: z.coerce.number() would turn an empty value into 0 (a valid-looking coordinate).
const numberText = (label) => z.string({ error: `${label} is required` }).trim().regex(/^-?\d+(\.\d+)?$/, `${label} must be a number`).transform(Number)
const integerText = (label) => z.string().trim().regex(/^\d+$/, `${label} must be a whole number`).transform(Number)

export const latitude = numberText('latitude').refine((v) => v >= -90 && v <= 90, 'latitude must be between -90 and 90')
export const longitude = numberText('longitude').refine((v) => v >= -180 && v <= 180, 'longitude must be between -180 and 180')

export const forecastQuerySchema = z.object({ latitude, longitude })

export const nearbyQuerySchema = z.object({
  latitude,
  longitude,
  radius: integerText('radius').refine((v) => v >= MIN_RADIUS_M && v <= MAX_RADIUS_M, `radius must be between ${MIN_RADIUS_M} and ${MAX_RADIUS_M} metres`).default(DEFAULT_RADIUS_M),
  category: z.enum([...CATEGORY_KEYS, 'all'], { error: `category must be one of: ${[...CATEGORY_KEYS, 'all'].join(', ')}` }).default('all'),
})

const hasControl = (s) => Array.from(s).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)

export const locationSearchSchema = z.object({
  q: z.string({ error: 'Enter a place to search for' }).trim().min(2, 'Type at least 2 characters').max(80, 'The search can be at most 80 characters').refine((s) => !hasControl(s), 'The search contains invalid characters'),
  country: z.string().trim().transform((s) => s.toUpperCase()).pipe(z.enum(['BD', 'ANY'], { error: 'country must be BD or ANY' })).default('BD'),
  count: integerText('count').refine((v) => v >= 1 && v <= 20, 'count must be between 1 and 20').default(10),
})
