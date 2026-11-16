import request from 'supertest'
import { createApp } from '../src/app.js'
import { idle } from '../src/services/email/emailService.js'
import { createMailbox } from './mailbox.js'

export const app = createApp({ authRateLimit: { limit: 1000 } })
export const api = () => request(app)
export const mailbox = createMailbox()
/** Wait until every queued email has been processed. */
export const flushEmails = () => idle()

let n = 0
export const uniqueEmail = (tag = 'user') => `${tag}-${Date.now()}-${n++}@readyset.test`

export const validRegistration = (overrides = {}) => ({
  name: 'Test User',
  email: uniqueEmail(),
  password: 'Sup3rSecret!',
  confirmPassword: 'Sup3rSecret!',
  ...overrides,
})

export async function registerAndLogin(overrides = {}) {
  const body = validRegistration(overrides)
  const res = await api().post('/api/auth/register').send(body)
  await flushEmails() // let the queued verification email finish so tests start from a quiet mailbox
  return { body, token: res.body.data.token, user: res.body.data.user }
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` })
