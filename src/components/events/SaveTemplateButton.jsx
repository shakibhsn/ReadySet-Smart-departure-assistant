import { useState } from 'react'
import { BookmarkPlus } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { FormInput } from '@/components/common/FormInput'
import { Button } from '@/components/ui/button'
import { createEventTemplate } from '@/services/scheduleApi'

/** "Save as template": copies this event's settings (not its date) into a reusable template. */
export function SaveTemplateButton({ event }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const close = () => {
    setOpen(false)
    setDone(false)
    setError('')
  }
  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return setError('Give the template a name.')
    setBusy(true)
    setError('')
    try {
      await createEventTemplate({ name: name.trim(), fromEventId: event.id })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => { setName(event.title); setOpen(true) }}>
        <BookmarkPlus className="size-4" /> Save as template
      </Button>
      {open && (
        <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === 'Escape' && close()}>
          <div role="dialog" aria-modal="true" aria-label="Save as template" className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-ink shadow-lift">
            <h2 className="text-lg font-bold">Save as template</h2>
            {done ? (
              <div className="mt-4 space-y-4">
                <Alert variant="success">Template saved. Use it from Create event.</Alert>
                <div className="flex justify-end"><Button onClick={close}>Done</Button></div>
              </div>
            ) : (
              <form onSubmit={save} noValidate className="mt-4 space-y-4">
                <p className="text-sm text-muted">Saves the title, place, travel, preparation and repeat pattern. The date is chosen when you use it.</p>
                {error && <Alert>{error}</Alert>}
                <FormInput label="Template name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="outline" onClick={close}>Cancel</Button>
                  <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save template'}</Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
