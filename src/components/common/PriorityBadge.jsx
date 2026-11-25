import { Badge } from '@/components/ui/badge'
import { PRIORITY_TONE } from '@/data/categories'

/** Shown only for high and low priority: normal is the default and stays quiet. */
export function PriorityBadge({ priority }) {
  if (priority !== 'high' && priority !== 'low') return null
  return <Badge className={PRIORITY_TONE[priority]}>{priority === 'high' ? 'High priority' : 'Low priority'}</Badge>
}
