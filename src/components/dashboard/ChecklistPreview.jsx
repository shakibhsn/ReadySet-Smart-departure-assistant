import { ListChecks } from 'lucide-react'
import { ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/common/EmptyState'
import { ChecklistItem } from '@/components/checklist/ChecklistItem'

export function ChecklistPreview({ eventTitle, items, progress, onToggle }) {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Smart checklist</CardTitle>
          <CardDescription className="truncate">{eventTitle ?? 'No upcoming event'}</CardDescription>
        </div>
        <ButtonLink to="/checklist" variant="ghost" size="sm">
          View all
        </ButtonLink>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState icon={ListChecks} title="No checklist yet" description="Open Smart Checklist to start from a template." className="py-8" />
        ) : (
          <>
            <div className="mb-3 flex items-center gap-3 px-1">
              <Progress value={progress.percent} label="Checklist progress" />
              <span className="shrink-0 text-xs font-semibold text-muted">
                {progress.done}/{progress.total}
              </span>
            </div>
            <ul className="space-y-0.5">
              {items.slice(0, 5).map((item) => (
                <ChecklistItem key={item.id} item={item} onToggle={onToggle} />
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
