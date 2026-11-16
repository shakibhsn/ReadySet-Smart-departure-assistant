import { Trash2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

export function ChecklistItem({ item, onToggle, onDelete, showGroup = false }) {
  return (
    <li
      className={cn(
        'group flex items-center gap-3 rounded-xl border border-transparent px-3 py-1 transition-colors hover:border-line hover:bg-canvas',
        item.done && 'opacity-70',
      )}
    >
      <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3">
        <Checkbox checked={item.done} onChange={() => onToggle(item.id)} />
        <span className={cn('text-sm font-medium', item.done && 'text-muted line-through')}>{item.text}</span>
        {showGroup && <span className="ml-auto rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">{item.group}</span>}
      </label>
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(item)}
          aria-label={`Delete ${item.text}`}
          className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </li>
  )
}
