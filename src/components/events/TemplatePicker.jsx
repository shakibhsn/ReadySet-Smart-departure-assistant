import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { FormSelect } from '@/components/common/FormSelect'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { deleteEventTemplate, getEventTemplates } from '@/services/scheduleApi'

/** Optional starting point for Create event. Hidden when the user has no templates (or they cannot be loaded). */
export function TemplatePicker({ value, onChange }) {
  const [templates, setTemplates] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getEventTemplates()
      .then((list) => !cancelled && setTemplates(list))
      .catch(() => !cancelled && setTemplates([])) // templates are optional: failing to load must never block creating an event
    return () => { cancelled = true }
  }, [])

  if (!templates || templates.length === 0) return null
  const selected = templates.find((t) => t.id === value)

  const remove = async () => {
    setError('')
    try {
      await deleteEventTemplate(selected.id)
      setTemplates((list) => list.filter((t) => t.id !== selected.id))
      onChange(null)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-end sm:pt-6">
        <FormSelect
          className="flex-1"
          label="Start from a template"
          placeholder="No template (blank event)"
          options={templates.map((t) => ({ value: t.id, label: t.name }))}
          value={value ?? ''}
          onChange={(e) => onChange(templates.find((t) => t.id === e.target.value) ?? null)}
          error={error}
          hint="Fills in the form; you choose the date and time."
        />
        {selected && (
          <Button variant="ghost" onClick={remove} aria-label={`Delete template ${selected.name}`} className="hover:bg-rose-50 hover:text-rose-600">
            <Trash2 className="size-4" /> Delete template
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
