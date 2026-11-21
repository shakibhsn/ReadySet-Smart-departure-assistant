import { z } from 'zod'
import { MAX_QUESTION_LENGTH } from '../services/assistant/assistantRules.js'

// Strict: unknown fields (e.g. a smuggled userId, sql, or tool name) are rejected, not ignored.
export const askSchema = z.strictObject({
  question: z.string({ error: 'Ask a question' }).trim().min(3, 'The question is too short').max(MAX_QUESTION_LENGTH, `The question must be at most ${MAX_QUESTION_LENGTH} characters`),
  eventId: z.uuid('Invalid event id').optional(),
})

export const confirmSchema = z.strictObject({ token: z.string({ error: 'A confirmation token is required' }).min(20).max(1000) })
