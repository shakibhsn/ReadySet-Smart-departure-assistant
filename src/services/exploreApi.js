import { apiRequest } from '@/lib/apiClient'
import { queryString } from '@/lib/queryString'

// Weather & Explore. Provider trouble comes back as a normal reply with `status` ('ok' | 'timeout' | 'provider_unavailable').

export const getForecast = async ({ latitude, longitude }) => (await apiRequest(`/weather/forecast${queryString({ latitude, longitude })}`)).data
export const searchLocations = async (q, { country = 'BD', count = 10 } = {}) => (await apiRequest(`/locations/search${queryString({ q, country, count })}`)).data
export const getNearbyPlaces = async ({ latitude, longitude, radius, category = 'all' }) => (await apiRequest(`/places/nearby${queryString({ latitude, longitude, radius, category })}`)).data
