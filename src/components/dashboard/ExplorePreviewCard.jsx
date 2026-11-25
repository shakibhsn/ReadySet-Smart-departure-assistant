import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const QUICK = [
  { value: 'cafe', label: 'Cafes' },
  { value: 'restaurant', label: 'Restaurants' },
  { value: 'park', label: 'Parks' },
  { value: 'museum', label: 'Museums' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'attraction', label: 'Attractions' },
]

/** A light entry point: no data is loaded here, the Explore page does the searching. */
export function ExplorePreviewCard({ location }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Explore destinations</CardTitle>
          <CardDescription>{location ? `Places near ${location.name}` : 'Choose a location to see places near you'}</CardDescription>
        </div>
        <Compass className="mt-1 size-5 text-brand-600" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <ul className="flex flex-wrap gap-2" aria-label="Explore by category">
          {QUICK.map((c) => (
            <li key={c.value}>
              <Link to={`/explore?category=${c.value}`} className="inline-flex h-8 items-center rounded-full border border-line bg-surface px-3 text-xs font-semibold text-muted transition-colors hover:border-brand-200 hover:text-brand-700">
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
