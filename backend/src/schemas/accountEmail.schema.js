import { z } from 'zod'

const email = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .pipe(z.email('Enter a valid email address'))

// Emailed tokens are 43 base64url characters; bound the length so absurd input never reaches the DB.
const token = z.string({ error: 'Token is required' }).min(20, 'Invalid token').max(200, 'Invalid token')

const password = z
  .string({ error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')

export const tokenOnlySchema = z.strictObject({ token })
export const emailOnlySchema = z.strictObject({ email })

export const resetPasswordSchema = z
  .strictObject({ token, password, confirmPassword: z.string({ error: 'Please confirm your password' }) })
  .refine((d) => d.password === d.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' })

export const requestEmailChangeSchema = z.strictObject({
  newEmail: email,
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(72),
})

// Only the three optional reminder types can be changed. Security / verification / reset emails cannot.
export const updateEmailPreferencesSchema = z
  .strictObject({
    upcomingEventReminders: z.boolean(),
    prepStartReminders: z.boolean(),
    departureReminders: z.boolean(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field to update' })
