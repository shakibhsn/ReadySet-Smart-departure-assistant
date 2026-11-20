import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { env } from './config/env.js'
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js'
import { createAuthRouter } from './routes/auth.routes.js'
import checklistRoutes, { templatesRouter } from './routes/checklist.routes.js'
import departureRoutes from './routes/departure.routes.js'
import eventRoutes from './routes/event.routes.js'
import weatherRoutes from './routes/weather.routes.js'
import { createUserRouter } from './routes/user.routes.js'

/** App factory (no listen) so tests can create isolated instances with their own options. */
export function createApp(options = {}) {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  // Bearer-token auth: no cookies, so credentialed CORS is not needed. Only the configured frontend origin is allowed.
  app.use(cors({ origin: env.FRONTEND_URL, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }))
  app.use(express.json({ limit: '10kb' }))

  app.get('/api/health', (_req, res) => res.json({ success: true, message: 'ok', data: {} }))
  app.use('/api/auth', createAuthRouter(options))
  app.use('/api/users', createUserRouter(options))
  // Per-event sub-resources first; they only match /:id/checklist... and /:id/weather.
  app.use('/api/events', checklistRoutes)
  app.use('/api/events', weatherRoutes)
  app.use('/api/events', eventRoutes)
  app.use('/api/checklist-templates', templatesRouter)
  app.use('/api/departure', departureRoutes)

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
