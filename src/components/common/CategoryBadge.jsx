import { Badge } from '@/components/ui/badge'
import { getCategory } from '@/data/categories'

export function CategoryBadge({ category }) {
  const { label, icon: Icon, tone } = getCategory(category)
  return (
    <Badge className={tone}>
      <Icon className="size-3.5" />
      {label}
    </Badge>
  )
}
