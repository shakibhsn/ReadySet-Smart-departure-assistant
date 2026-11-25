import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/common/PageHeader'
import { BangladeshExplorer } from '@/components/explore/BangladeshExplorer'
import { ExploreDestinations } from '@/components/explore/ExploreDestinations'
import { LocationSearch } from '@/components/explore/LocationSearch'
import { LocationWeatherCard } from '@/components/weather/LocationWeatherCard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useForecast } from '@/hooks/useForecast'
import { useRemoteData } from '@/hooks/useRemoteData'
import { useWeatherLocation } from '@/hooks/useWeatherLocation'
import { EXPLORE_CATEGORIES } from '@/lib/exploreRules'
import { getUpcomingPlans } from '@/services/departureApi'

export default function ExplorePage() {
  const { location, setLocation, clear } = useWeatherLocation()
  const [params] = useSearchParams()
  const wanted = params.get('category') // e.g. from the dashboard's quick links; anything unknown is ignored
  const initialCategory = EXPLORE_CATEGORIES.some((c) => c.value === wanted) ? wanted : 'all'
  const forecast = useForecast(location)
  // The user's next planned departure (existing departure engine), so suggestions can use the forecast for THAT time.
  const next = useRemoteData(() => getUpcomingPlans({ days: 7, limit: 1 }), [])
  const plan = next.data?.plans?.[0]
  const departure = plan ? { at: plan.plan.departureTime, title: plan.event.title ?? 'your event' } : null

  return (
    <div className="space-y-6">
      <PageHeader title="Weather & Explore" description="Check the weather anywhere in Bangladesh and find places worth going to." />

      {/* Browse the whole country on the map: division, district, upazila, then destinations. */}
      <BangladeshExplorer departure={departure} />

      <div className="grid items-start gap-6 xl:grid-cols-12">
        {/* Left: your saved weather location; right: places near it */}
        <div className="min-w-0 space-y-6 xl:col-span-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Your location</CardTitle>
                <CardDescription>Used for the weather on your dashboard and for nearby places. Saved on this device.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <LocationSearch selected={location} onSelect={setLocation} onClear={clear} />
            </CardContent>
          </Card>
          {location && <LocationWeatherCard location={location} query={forecast} />}
        </div>

        <div className="min-w-0 space-y-6 xl:col-span-8">
          {location && (
            <ExploreDestinations key={`${location.latitude},${location.longitude}`} initialCategory={initialCategory} location={location} forecast={forecast.data} departure={departure} description={`Places near your saved location, ${location.name}, from OpenStreetMap.`} />
          )}
        </div>
      </div>
    </div>
  )
}
