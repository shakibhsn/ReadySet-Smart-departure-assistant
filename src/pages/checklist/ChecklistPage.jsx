import { useState } from 'react'
import { CheckCircle2, Circle, ListChecks, Plus, Wand2 } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { FormInput } from '@/components/common/FormInput'
import { FormSelect } from '@/components/common/FormSelect'
import { SegmentedControl } from '@/components/common/SegmentedControl'
import { ProgressCard } from '@/components/common/ProgressCard'
import { EmptyState } from '@/components/common/EmptyState'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { ChecklistItem } from '@/components/checklist/ChecklistItem'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppState } from '@/hooks/useAppState'
import { CHECKLIST_GROUPS, checklistTemplates } from '@/data/checklists'
import { formatDayLabel, formatTime12 } from '@/utils/format'
import { getNextEvent, getProgress, sortEvents } from '@/utils/events'

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'done', label: 'Done' },
]

export default function ChecklistPage() {
  const { events, checklists, toggleItem, addItem, deleteItem, applyTemplate } = useAppState()
  const sorted = sortEvents(events)
  const [eventId, setEventId] = useState(() => (getNextEvent(events) ?? sorted[0])?.id ?? '')
  const [filter, setFilter] = useState('all')
  const [text, setText] = useState('')
  const [group, setGroup] = useState(CHECKLIST_GROUPS[0])
  const [error, setError] = useState('')
  const [toDelete, setToDelete] = useState(null)

  if (events.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Smart Checklist" description="Never leave without what you need." />
        <EmptyState
          icon={ListChecks}
          title="Create an event first"
          description="Checklists belong to events. Add one to get started."
          action={<ButtonLink to="/events/new">Create event</ButtonLink>}
        />
      </div>
    )
  }

  const event = events.find((e) => e.id === eventId) ?? sorted[0]
  const items = checklists[event.id] ?? []
  const progress = getProgress(items)
  const visible = items.filter((i) => filter === 'all' || (filter === 'done' ? i.done : !i.done))
  const groups = CHECKLIST_GROUPS.filter((g) => visible.some((i) => i.group === g))

  const handleAdd = (e) => {
    e.preventDefault()
    if (!text.trim()) return setError('Enter an item name.')
    addItem(event.id, text.trim(), group)
    setText('')
    setError('')
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Smart Checklist" description="Never leave without what you need." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-[1fr_auto] sm:items-end sm:pt-6">
              <FormSelect
                label="Event"
                value={event.id}
                onChange={(e) => setEventId(e.target.value)}
                options={sorted.map((e) => ({ value: e.id, label: `${e.title} · ${formatDayLabel(e.date)}, ${formatTime12(e.startTime)}` }))}
              />
              <div className="flex gap-4 pb-2 text-sm font-semibold sm:pb-3">
                <span className="inline-flex items-center gap-1.5 text-accent-700">
                  <CheckCircle2 className="size-4" /> {progress.done} done
                </span>
                <span className="inline-flex items-center gap-1.5 text-muted">
                  <Circle className="size-4" /> {progress.remaining} pending
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-wrap items-center">
              <div>
                <CardTitle>Items</CardTitle>
                <CardDescription>{event.title}</CardDescription>
              </div>
              <SegmentedControl label="Filter items" options={FILTERS} value={filter} onChange={setFilter} />
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAdd} noValidate className="mb-5 grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-start">
                <FormInput label="Add item" placeholder="e.g. Umbrella" value={text} error={error} onChange={(e) => { setText(e.target.value); setError('') }} />
                <FormSelect label="Group" value={group} onChange={(e) => setGroup(e.target.value)} options={CHECKLIST_GROUPS.map((g) => ({ value: g, label: g }))} />
                <Button type="submit" className="sm:mt-[1.75rem]">
                  <Plus className="size-4" /> Add
                </Button>
              </form>

              {items.length === 0 ? (
                <EmptyState icon={ListChecks} title="Empty checklist" description="Add items above or apply a template." className="py-8" />
              ) : visible.length === 0 ? (
                <p className="rounded-xl bg-canvas p-4 text-center text-sm text-muted">No {filter === 'done' ? 'completed' : 'pending'} items.</p>
              ) : (
                <div className="space-y-5">
                  {groups.map((g) => (
                    <section key={g} aria-label={g}>
                      <h3 className="mb-1 px-3 text-xs font-bold uppercase tracking-wider text-muted">{g}</h3>
                      <ul className="space-y-0.5">
                        {visible.filter((i) => i.group === g).map((item) => (
                          <ChecklistItem key={item.id} item={item} onToggle={(id) => toggleItem(event.id, id)} onDelete={setToDelete} />
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <ProgressCard title="Readiness" {...progress} />
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Templates</CardTitle>
                <CardDescription>Add a starter set. Duplicates are skipped.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(checklistTemplates).map(([key, t]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyTemplate(event.id, key)}
                  className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border border-line px-4 text-left transition-colors hover:border-brand-200 hover:bg-brand-50"
                >
                  <Wand2 className="size-4 text-brand-600" />
                  <span className="flex-1 text-sm font-semibold">{t.label}</span>
                  <span className="text-xs text-muted">{t.items.length} items</span>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        destructive
        title="Delete item?"
        description={toDelete ? `"${toDelete.text}" will be removed from this checklist.` : ''}
        confirmLabel="Delete"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          deleteItem(event.id, toDelete.id)
          setToDelete(null)
        }}
      />
    </div>
  )
}
