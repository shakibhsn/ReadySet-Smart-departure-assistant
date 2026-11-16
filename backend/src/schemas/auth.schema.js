import { z } from 'zod'

const email = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .pipe(z.email('Enter a valid email address'))

export const registerSchema = z
  .strictObject({
    name: z
      .string({ error: 'Name is required' })
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must be at most 100 characters'),
    email,
    // bcrypt only uses the first 72 bytes, so cap the length to avoid silent truncation.
    password: z
      .string({ error: 'Password is required' })
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password must be at most 72 characters'),
    confirmPassword: z.string({ error: 'Please confirm your password' }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })

export const loginSchema = z.strictObject({
  email,
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(72),
})
