import request from 'supertest'
import { createApp } from '../src/app.js'

export const app = createApp({ authRateLimit: { limit: 1000 } })
export const api = () => request(app)

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
  return { body, token: res.body.data.token, user: res.body.data.user }
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` })
