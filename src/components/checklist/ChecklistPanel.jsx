import { useState } from 'react'
import { CheckCircle2, ListChecks, Plus, Wand2 } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { FormInput } from '@/components/common/FormInput'
import { FormSelect } from '@/components/common/FormSelect'
import { Skeleton } from '@/components/common/LoadingSkeleton'
import { SegmentedControl } from '@/components/common/SegmentedControl'
import { ChecklistItem } from '@/components/checklist/ChecklistItem'
import { SavePackingTemplate } from '@/components/checklist/SavePackingTemplate'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useChecklist } from '@/hooks/useChecklist'
import { useEventQuery } from '@/hooks/useEventQuery'
import { CHECKLIST_GROUPS, getChecklistTemplates } from '@/services/checklistApi'
import { getFrequentlyForgotten, getPackingTemplates } from '@/services/packingApi'

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'done', label: 'Done' },
]

/** The full checklist of one event (database-backed): progress, add / edit / delete / complete, templates. */
export function ChecklistPanel({ event }) {
  const list = useChecklist(event.id)
  const templates = useEventQuery(() => getChecklistTemplates(), [])
  // Both are optional extras: if they fail to load the checklist itself keeps working.
  const mine = useEventQuery(() => getPackingTemplates().catch(() => []), [])
  const oftenForgotten = useEventQuery(() => getFrequentlyForgotten().catch(() => []), [])
  const [filter, setFilter] = useState('all')
  const [text, setText] = useState('')
  const [group, setGroup] = useState(CHECKLIST_GROUPS[0])
  const [error, setError] = useState('')
  const [toDelete, setToDelete] = useState(null)
  const [busy, setBusy] = useState(false)

  const { items, progress } = list
  const visible = items.filter((i) => filter === 'all' || (filter === 'done' ? i.done : !i.done))
  const groups = CHECKLIST_GROUPS.filter((g) => visible.some((i) => i.group === g))
  const ownTemplate = templates.data?.find((t) => t.key === event.category)
  const myTemplates = mine.data ?? []
  const missingOften = (oftenForgotten.data ?? []).filter((f) => !items.some((i) => i.text.trim().toLowerCase() === f.text.trim().toLowerCase()))
  const otherTemplates = (templates.data ?? []).filter((t) => t.items.length > 0 && t.key !== event.category)

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!text.trim()) return setError('Enter an item name.')
    if (text.trim().length > 120) return setError('Item names can be at most 120 characters.')
    setBusy(true)
    const ok = await list.add(text.trim(), group)
    setBusy(false)
    if (ok) {
      setText('')
      setError('')
    }
  }

  return (
    <Card>
      <CardHeader className="flex-wrap items-center">
        <div className="min-w-0">
          <CardTitle>Checklist</CardTitle>
          <CardDescription className="truncate">{event.title}</CardDescription>
        </div>
        <SegmentedControl label="Filter items" options={FILTERS} value={filter} onChange={setFilter} />
      </CardHeader>
      <CardContent>
        {list.loading ? (
          <div role="status" aria-label="Loading checklist" className="space-y-3">
            <Skeleton className="h-6" />
            <Skeleton className="h-24" />
          </div>
        ) : list.loadError ? (
          <Alert>
            {list.loadError.message}{' '}
            <button type="button" onClick={list.reload} className="font-bold underline">Try again</button>
          </Alert>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3 px-1" data-testid="checklist-progress">
              <Progress value={progress.percent} label="Checklist progress" />
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-muted">
                <CheckCircle2 className="size-4 text-accent-600" /> {progress.done}/{progress.total} done{progress.remaining > 0 && ` · ${progress.remaining} left`}
              </span>
            </div>

            {missingOften.length > 0 && (
              <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
                <p className="font-semibold">You often forget (from your own reports):</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {missingOften.map((f) => (
                    <button key={f.text} type="button" onClick={() => list.add(f.text, 'Essentials')} aria-label={`Add ${f.text}`} className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100">
                      <Plus className="size-3.5" /> {f.text} <span className="text-amber-600">({f.reports}×)</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {list.actionError && <Alert className="mb-4">{list.actionError}</Alert>}
            {list.notice && <Alert variant="success" className="mb-4">{list.notice}</Alert>}

            <form onSubmit={handleAdd} noValidate className="mb-5 grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-start">
              <FormInput label="Add item" placeholder="e.g. Umbrella" value={text} error={error} onChange={(e) => { setText(e.target.value); setError('') }} />
              <FormSelect label="Group" value={group} onChange={(e) => setGroup(e.target.value)} options={CHECKLIST_GROUPS.map((g) => ({ value: g, label: g }))} />
              <Button type="submit" disabled={busy} className="sm:mt-[1.75rem]">
                <Plus className="size-4" /> Add
              </Button>
            </form>

            {items.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                title="No checklist yet"
                description={ownTemplate?.items.length ? `Start from the ${ownTemplate.label} template, or add your own items above.` : 'Add the things you need to bring above.'}
                action={
                  ownTemplate?.items.length || myTemplates.length ? (
                    <div className="flex flex-wrap justify-center gap-2">
                      {ownTemplate?.items.length > 0 && <Button variant="soft" onClick={() => list.applyTemplate()}><Wand2 className="size-4" /> Add {ownTemplate.label} items</Button>}
                      {myTemplates.map((t) => <Button key={t.id} variant="outline" onClick={() => list.applyTemplate({ personalTemplateId: t.id })}><Wand2 className="size-4" /> {t.name}</Button>)}
                    </div>
                  ) : null
                }
                className="py-8"
              />
            ) : visible.length === 0 ? (
              <p className="rounded-xl bg-canvas p-4 text-center text-sm text-muted">No {filter === 'done' ? 'completed' : 'pending'} items.</p>
            ) : (
              <div className="space-y-5">
                {groups.map((g) => (
                  <section key={g} aria-label={g}>
                    <h3 className="mb-1 px-3 text-xs font-bold uppercase tracking-wider text-muted">{g}</h3>
                    <ul className="space-y-0.5">
                      {visible.filter((i) => i.group === g).map((item) => (
                        <ChecklistItem key={item.id} item={item} onToggle={list.toggle} onEdit={list.edit} onDelete={setToDelete} onForgot={list.forgot} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}

            {items.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                <SavePackingTemplate eventId={event.id} defaultName={event.title} onSaved={() => mine.reload()} />
              </div>
            )}
            {items.length > 0 && (ownTemplate?.items.length > 0 || otherTemplates.length > 0 || myTemplates.length > 0) && (
              <details className="mt-5 rounded-xl border border-line px-4 py-3 text-sm">
                <summary className="cursor-pointer font-semibold text-brand-700">Add items from a template</summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[ownTemplate, ...otherTemplates].filter((t) => t?.items.length).map((t) => (
                    <Button key={t.key} size="sm" variant="outline" onClick={() => list.applyTemplate(t.key)}>
                      <Wand2 className="size-4" /> {t.label}
                    </Button>
                  ))}
                  {myTemplates.map((t) => (
                    <Button key={t.id} size="sm" variant="soft" onClick={() => list.applyTemplate({ personalTemplateId: t.id })} aria-label={`Apply my template ${t.name}`}>
                      <Wand2 className="size-4" /> {t.name}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">Items you already have are skipped.</p>
              </details>
            )}
          </>
        )}
      </CardContent>

      <ConfirmDialog
        open={Boolean(toDelete)}
        destructive
        title="Delete item?"
        description={toDelete ? `"${toDelete.text}" will be removed from this checklist.` : ''}
        confirmLabel="Delete"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          list.remove(toDelete)
          setToDelete(null)
        }}
      />
    </Card>
  )
}
