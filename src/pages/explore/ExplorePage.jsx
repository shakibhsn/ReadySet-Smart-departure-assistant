import { MapPinned } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { ExploreDestinations } from '@/components/explore/ExploreDestinations'
import { LocationSearch } from '@/components/explore/LocationSearch'
import { LocationWeatherCard } from '@/components/weather/LocationWeatherCard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useForecast } from '@/hooks/useForecast'
import { useRemoteData } from '@/hooks/useRemoteData'
import { useWeatherLocation } from '@/hooks/useWeatherLocation'
import { getUpcomingPlans } from '@/services/departureApi'

export default function ExplorePage() {
  const { location, setLocation, clear } = useWeatherLocation()
  const forecast = useForecast(location)
  // The user's next planned departure (existing departure engine), so suggestions can use the forecast for THAT time.
  const next = useRemoteData(() => getUpcomingPlans({ days: 7, limit: 1 }), [])
  const plan = next.data?.plans?.[0]
  const departure = plan ? { at: plan.plan.departureTime, title: plan.event.title ?? 'your event' } : null

  return (
    <div className="space-y-6">
      <PageHeader title="Weather & Explore" description="Check the weather anywhere in Bangladesh and find places worth going to." />

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

      {!location ? (
        <EmptyState icon={MapPinned} title="Pick a location to begin" description="Search for your city, district or area, or share your current location, and ReadySet will show the weather and nearby places." />
      ) : (
        <>
          <LocationWeatherCard location={location} query={forecast} />
          <ExploreDestinations key={`${location.latitude},${location.longitude}`} location={location} forecast={forecast.data} departure={departure} />
        </>
      )}
    </div>
  )
}
