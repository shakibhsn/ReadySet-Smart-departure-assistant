import { useState } from 'react'
import { BookmarkPlus } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { FormInput } from '@/components/common/FormInput'
import { Button } from '@/components/ui/button'
import { createPackingTemplate } from '@/services/packingApi'

/** Saves this event's CURRENT checklist as one of the user's own reusable packing templates. */
export function SavePackingTemplate({ eventId, defaultName, onSaved }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const close = () => {
    setOpen(false)
    setError('')
  }
  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return setError('Give the template a name.')
    setBusy(true)
    setError('')
    try {
      const t = await createPackingTemplate({ name: name.trim(), fromEventId: eventId })
      onSaved?.(t)
      close()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { setName(defaultName ?? ''); setOpen(true) }}>
        <BookmarkPlus className="size-4" /> Save as my template
      </Button>
      {open && (
        <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === 'Escape' && close()}>
          <div role="dialog" aria-modal="true" aria-label="Save packing template" className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-ink shadow-lift">
            <h2 className="text-lg font-bold">Save as my template</h2>
            <form onSubmit={save} noValidate className="mt-4 space-y-4">
              <p className="text-sm text-muted">Saves the items on this checklist (not whether they are packed). Reuse it on any future event.</p>
              {error && <Alert>{error}</Alert>}
              <FormInput label="Template name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={close}>Cancel</Button>
                <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save template'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
