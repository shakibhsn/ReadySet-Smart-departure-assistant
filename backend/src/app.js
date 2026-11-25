import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { env } from './config/env.js'
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js'
import { createAuthRouter } from './routes/auth.routes.js'
import checklistRoutes, { templatesRouter } from './routes/checklist.routes.js'
import { occurrenceRouter, scheduleRouter, templateRouter } from './routes/schedule.routes.js'
import { forgotRouter, packingRouter, packingTemplatesRouter, placesRouter } from './routes/packing.routes.js'
import { prepEventRouter, prepProfileRouter } from './routes/prep.routes.js'
import { createExploreRouters } from './routes/explore.routes.js'
import { analyticsRouter, weekRouter } from './routes/analytics.routes.js'
import { createAssistantRouter } from './routes/assistant.routes.js'
import notificationRoutes from './routes/notification.routes.js'
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
  app.use('/api/events', occurrenceRouter)
  app.use('/api/events', forgotRouter)
  app.use('/api/events', prepEventRouter)
  app.use('/api/prep-profile', prepProfileRouter)
  // Weather & Explore first: GET /api/places/nearby must not be read as a saved-place id by the router below.
  const explore = createExploreRouters(options)
  app.use('/api/weather', explore.weather)
  app.use('/api/locations', explore.locations)
  app.use('/api/places', explore.places)
  app.use('/api/places', placesRouter)
  app.use('/api/packing-templates', packingTemplatesRouter)
  app.use('/api/packing', packingRouter)
  app.use('/api/event-templates', templateRouter)
  app.use('/api/schedule', scheduleRouter)
  app.use('/api/events', eventRoutes)
  app.use('/api/checklist-templates', templatesRouter)
  app.use('/api/departure', departureRoutes)
  app.use('/api/notifications', notificationRoutes)
  app.use('/api/analytics', analyticsRouter)
  app.use('/api/week', weekRouter)
  app.use('/api/assistant', createAssistantRouter(options))

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
