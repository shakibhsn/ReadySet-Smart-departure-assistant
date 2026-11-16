import { useId } from 'react'
import { cn } from '@/lib/utils'
import { FieldShell } from './FieldShell'
import { describedBy, fieldClass } from '@/lib/formStyles'

export function FormTextarea({ label, error, hint, required, className, rows = 4, ...props }) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <textarea
        id={id}
        rows={rows}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(fieldClass(error), 'h-auto resize-y py-3')}
        {...props}
      />
    </FieldShell>
  )
}
