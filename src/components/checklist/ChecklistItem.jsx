import { useState } from 'react'
import { Check, PackageX, Pencil, Trash2, X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

const iconButton = 'flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100'

/** One checklist row: toggle, optional inline edit (name), optional delete. `item` = { id, text, group, done }. */
export function ChecklistItem({ item, onToggle, onEdit, onDelete, onForgot, showGroup = false }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.text)

  const save = async (e) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    if (text === item.text) return setEditing(false)
    if (await onEdit(item, { text })) setEditing(false)
  }

  if (editing) {
    return (
      <li className="rounded-xl border border-brand-200 bg-canvas px-3 py-2">
        <form onSubmit={save} className="flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            maxLength={120}
            aria-label={`Rename ${item.text}`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
            className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm"
          />
          <button type="submit" aria-label="Save name" disabled={!draft.trim()} className="flex size-10 cursor-pointer items-center justify-center rounded-lg text-accent-700 hover:bg-accent-50 disabled:opacity-40">
            <Check className="size-4" />
          </button>
          <button type="button" aria-label="Cancel editing" onClick={() => { setEditing(false); setDraft(item.text) }} className="flex size-10 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </form>
      </li>
    )
  }

  return (
    <li className={cn('group flex items-center gap-1 rounded-xl border border-transparent px-3 py-1 transition-colors hover:border-line hover:bg-canvas', item.done && 'opacity-70')}>
      <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3">
        <Checkbox checked={item.done} onChange={() => onToggle(item)} />
        <span className={cn('text-sm font-medium', item.done && 'text-muted line-through')}>{item.text}</span>
        {showGroup && <span className="ml-auto rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">{item.group}</span>}
      </label>
      {onForgot && (
        <button type="button" onClick={() => onForgot(item)} aria-label={`I forgot ${item.text}`} title="I forgot this" className={cn(iconButton, 'hover:bg-amber-50 hover:text-amber-700')}>
          <PackageX className="size-4" />
        </button>
      )}
      {onEdit && (
        <button type="button" onClick={() => { setDraft(item.text); setEditing(true) }} aria-label={`Edit ${item.text}`} className={cn(iconButton, 'hover:bg-brand-50 hover:text-brand-700')}>
          <Pencil className="size-4" />
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={() => onDelete(item)} aria-label={`Delete ${item.text}`} className={cn(iconButton, 'hover:bg-rose-50 hover:text-rose-600')}>
          <Trash2 className="size-4" />
        </button>
      )}
    </li>
  )
}
