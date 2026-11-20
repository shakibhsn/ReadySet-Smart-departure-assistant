import { useState } from 'react'
import { Building2, GraduationCap, Home, MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { Alert } from '@/components/common/Alert'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { FormInput } from '@/components/common/FormInput'
import { FormSelect } from '@/components/common/FormSelect'
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useEventQuery } from '@/hooks/useEventQuery'
import { fieldErrorsFrom } from '@/lib/apiClient'
import { createPlace, deletePlace, getPlaces, setDefaultPlace, updatePlace } from '@/services/packingApi'

const PLACE_KINDS = [
  { value: 'home', label: 'Home' },
  { value: 'office', label: 'Office' },
  { value: 'university', label: 'University' },
  { value: 'other', label: 'Other' },
]
const ICONS = { home: Home, office: Building2, university: GraduationCap, other: MapPin }
const blank = { label: '', kind: 'other', address: '', makeDefault: false }

function validate(form) {
  const errors = {}
  if (!form.label.trim()) errors.label = 'Give the place a name.'
  else if (form.label.trim().length > 60) errors.label = 'At most 60 characters.'
  if (!form.address.trim()) errors.address = 'Enter an address or place name.'
  else if (form.address.trim().length > 255) errors.address = 'At most 255 characters.'
  return errors
}

function PlaceForm({ initial, submitLabel, onSubmit, onCancel, showDefault }) {
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((prev) => ({ ...prev, [k]: undefined }))
  }

  const submit = async (e) => {
    e.preventDefault()
    const found = validate(form)
    setErrors(found)
    setFormError('')
    if (Object.keys(found).length) return
    setBusy(true)
    try {
      await onSubmit({ label: form.label.trim(), kind: form.kind, address: form.address.trim(), ...(showDefault && form.makeDefault && { makeDefault: true }) })
      if (!onCancel) setForm(blank)
    } catch (err) {
      setErrors(fieldErrorsFrom(err))
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      {formError && <Alert className="sm:col-span-2">{formError}</Alert>}
      <FormInput label="Name" placeholder="e.g. Home, Main campus" value={form.label} error={errors.label} maxLength={60} onChange={set('label')} />
      <FormSelect label="Type" options={PLACE_KINDS} value={form.kind} onChange={set('kind')} />
      <FormInput className="sm:col-span-2" label="Address or place" icon={MapPin} placeholder="Building, street, city" value={form.address} error={errors.address} maxLength={255} onChange={set('address')} />
      {showDefault && (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium sm:col-span-2">
          <input type="checkbox" className="size-5 cursor-pointer accent-brand-600" checked={form.makeDefault} onChange={(e) => setForm((f) => ({ ...f, makeDefault: e.target.checked }))} />
          Use as my default starting location
        </label>
      )}
      <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</Button>
      </div>
    </form>
  )
}

export default function PlacesPage() {
  const query = useEventQuery(() => getPlaces(), [])
  const [editingId, setEditingId] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [actionError, setActionError] = useState('')

  if (query.loading && !query.data) return <LoadingSkeleton cards={2} />
  if (query.error) {
    return (
      <Alert>
        {query.error.message}{' '}
        <button type="button" onClick={query.reload} className="font-bold underline">Try again</button>
      </Alert>
    )
  }
  const { places, defaultStartPlaceId } = query.data

  const act = async (fn) => {
    setActionError('')
    try {
      await fn()
      query.reload()
    } catch (err) {
      setActionError(err.message)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Saved Places" description="Name the places you go to often, then pick them when you create an event." />
      <p className="rounded-xl bg-canvas p-4 text-sm text-muted">
        Only you can see your places, and addresses are never written to logs. When you pick a place for an event, its address is <strong>copied</strong> into that event, so editing a place later does not change events you already made. Your default starting location is saved for your reference; it is not used to calculate travel time.
      </p>
      {actionError && <Alert>{actionError}</Alert>}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Add a place</CardTitle>
            <CardDescription>Home, office, university or anywhere you go regularly.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <PlaceForm initial={blank} submitLabel="Add place" showDefault onSubmit={async (body) => { await createPlace(body); query.reload() }} />
        </CardContent>
      </Card>

      {places.length === 0 ? (
        <EmptyState icon={MapPin} title="No saved places yet" description="Add your first place above. It will appear when you create events." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {places.map((p) => {
            const Icon = ICONS[p.kind] ?? MapPin
            return (
              <li key={p.id}>
                <Card className="h-full">
                  <CardContent className="space-y-3 pt-5 sm:pt-5">
                    {editingId === p.id ? (
                      <PlaceForm
                        initial={{ label: p.label, kind: p.kind, address: p.address, makeDefault: false }}
                        submitLabel="Save changes"
                        onCancel={() => setEditingId(null)}
                        onSubmit={async (body) => { await updatePlace(p.id, body); setEditingId(null); query.reload() }}
                      />
                    ) : (
                      <>
                        <div className="flex items-start gap-3">
                          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="size-5" /></span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-base font-bold">{p.label}</h3>
                              {p.isDefaultStart && <Badge className="bg-accent-50 text-accent-700 ring-accent-200"><Star className="size-3.5" /> Default start</Badge>}
                            </div>
                            <p className="mt-0.5 break-words text-sm text-muted">{p.address}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {p.isDefaultStart ? (
                            <Button size="sm" variant="ghost" onClick={() => act(() => setDefaultPlace(null))}>Clear default</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => act(() => setDefaultPlace(p.id))} aria-label={`Use ${p.label} as default start`}><Star className="size-4" /> Set as default start</Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(p.id)} aria-label={`Edit ${p.label}`}><Pencil className="size-4" /> Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => setToDelete(p)} aria-label={`Delete ${p.label}`} className="hover:bg-rose-50 hover:text-rose-600"><Trash2 className="size-4" /> Delete</Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
      {defaultStartPlaceId === null && places.length > 0 && <p className="text-xs text-muted"><Plus className="mr-1 inline size-3.5" />No default starting location chosen.</p>}

      <ConfirmDialog
        open={Boolean(toDelete)}
        destructive
        title="Delete this place?"
        description={toDelete ? `"${toDelete.label}" will be removed. Events that already use its address keep it.` : ''}
        confirmLabel="Delete"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          const id = toDelete.id
          setToDelete(null)
          act(() => deletePlace(id))
        }}
      />
    </div>
  )
}
