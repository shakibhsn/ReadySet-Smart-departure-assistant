import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { forecastQuerySchema, locationSearchSchema, nearbyQuerySchema } from '../schemas/explore.schema.js'
import { getLocationForecast } from '../services/explore/forecast.service.js'
import { searchLocations } from '../services/explore/locationSearch.service.js'
import { findNearby } from '../services/explore/nearby.service.js'
import { sendSuccess } from '../utils/apiResponse.js'
import { makeLimiter } from './auth.routes.js'

// Weather & Explore. All routes need a login (this also protects the free providers' quotas) and are rate limited.
// Provider trouble is a normal 200 reply with `status` (like event weather); bad input is a 400.
// Only coordinates / search text leave the server: never a user id, name, email or token.
export function createExploreRouters({ exploreRateLimit, exploreOptions = {} } = {}) {
  const { fetchFn, now = () => new Date(), overpassUrl } = exploreOptions
  const limit = (n) => makeLimiter(n, { windowMs: 10 * 60 * 1000, ...exploreRateLimit })

  const weather = Router()
  weather.use(requireAuth)
  weather.get('/forecast', limit(120), validate(forecastQuerySchema, 'query'), async (req, res) => {
    sendSuccess(res, 200, 'Forecast retrieved', await getLocationForecast(req.validated.query, now(), fetchFn))
  })

  const locations = Router()
  locations.use(requireAuth)
  locations.get('/search', limit(120), validate(locationSearchSchema, 'query'), async (req, res) => {
    sendSuccess(res, 200, 'Locations retrieved', await searchLocations(req.validated.query, now(), fetchFn))
  })

  const places = Router()
  places.use(requireAuth)
  places.get('/nearby', limit(60), validate(nearbyQuerySchema, 'query'), async (req, res) => {
    sendSuccess(res, 200, 'Nearby places retrieved', await findNearby(req.validated.query, now(), fetchFn, overpassUrl))
  })

  return { weather, locations, places }
}
