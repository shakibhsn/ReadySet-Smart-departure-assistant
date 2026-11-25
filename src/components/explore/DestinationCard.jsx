import { MapPin, Navigation } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatDistance } from '@/lib/exploreRules'
import { cn } from '@/lib/utils'

const FIT_TONE = { suits: 'bg-accent-50 text-accent-700 ring-accent-200', caution: 'bg-amber-50 text-amber-700 ring-amber-200' }
const FIT_LABEL = { suits: 'May suit the forecast', caution: 'Check the forecast' }

/** One destination. Shows only what OpenStreetMap returned; missing fields say "Not available". */
export function DestinationCard({ place, fit, selected, onSelect }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(place.id)}
        aria-pressed={selected}
        className={cn('flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-colors', selected ? 'border-brand-500 bg-brand-50' : 'border-line bg-surface hover:border-brand-200')}
      >
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <MapPin className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-ink">{place.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span>{place.categoryLabel}</span>
            <span className="inline-flex items-center gap-1"><Navigation className="size-3" aria-hidden="true" />{formatDistance(place.distanceMeters)} away</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted">{place.address ?? place.locality ?? 'Address not available'}</span>
          {fit?.fit && (
            <span className="mt-1.5 block">
              <Badge className={FIT_TONE[fit.fit]} title={fit.reason}>{FIT_LABEL[fit.fit]}</Badge>
              <span className="sr-only">{fit.reason}</span>
            </span>
          )}
        </span>
      </button>
    </li>
  )
}
