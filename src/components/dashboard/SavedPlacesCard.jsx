import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { Skeleton } from '@/components/common/LoadingSkeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useRemoteData } from '@/hooks/useRemoteData'
import { getPlaces } from '@/services/packingApi'

const SHOWN = 4

/** The user's saved places (existing feature), at most four, with a link to manage them. */
export function SavedPlacesCard() {
  const query = useRemoteData(() => getPlaces(), [])
  const places = query.data?.places ?? []
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Saved places</CardTitle>
          <CardDescription>Home, office and favourite destinations</CardDescription>
        </div>
        <Link to="/places" className="text-sm font-semibold text-brand-700 hover:underline">Manage</Link>
      </CardHeader>
      <CardContent>
        {query.loading && !query.data ? (
          <div role="status" aria-label="Loading saved places"><Skeleton className="h-16" /></div>
        ) : query.error ? (
          <p className="text-sm text-muted">Saved places could not be loaded. <button type="button" onClick={query.reload} className="font-bold text-brand-700 underline">Try again</button></p>
        ) : places.length === 0 ? (
          <p className="text-sm text-muted">No saved places yet. <Link to="/places" className="font-semibold text-brand-700 hover:underline">Add one</Link> to reuse it as an event destination.</p>
        ) : (
          <ul className="space-y-2">
            {places.slice(0, SHOWN).map((p) => (
              <li key={p.id} className="flex items-start gap-2.5 text-sm">
                <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{p.label}</span>
                  <span className="block truncate text-xs text-muted">{p.address}</span>
                </span>
              </li>
            ))}
            {places.length > SHOWN && <li className="text-xs text-muted">and {places.length - SHOWN} more</li>}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
