import { useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FieldShell } from './FieldShell'
import { describedBy, fieldClass } from '@/lib/formStyles'

export function FormSelect({ label, options, error, hint, required, className, placeholder, ...props }) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <div className="relative">
        <select
          id={id}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(id, error, hint)}
          className={cn(fieldClass(error), 'cursor-pointer appearance-none pr-10')}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      </div>
    </FieldShell>
  )
}
