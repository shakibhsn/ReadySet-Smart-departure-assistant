import { useRemoteData } from '@/hooks/useRemoteData'
import { getForecast } from '@/services/exploreApi'

/** One forecast request per location (shared by the dashboard card and the Explore page). */
export const useForecast = (location) =>
  useRemoteData(() => (location ? getForecast(location) : null), [location?.latitude, location?.longitude])
