import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FieldShell } from './FieldShell'
import { describedBy, fieldClass } from '@/lib/formStyles'

export function FormInput({ label, error, hint, required, className, type = 'text', icon: Icon, suffix, ...props }) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'

  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required} className={className}>
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />}
        <input
          id={id}
          type={isPassword && visible ? 'text' : type}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(id, error, hint)}
          className={cn(fieldClass(error), Icon && 'pl-10', (isPassword || suffix) && 'pr-12')}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-brand-50 hover:text-brand-700"
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
        {suffix && (
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted">
            {suffix}
          </span>
        )}
      </div>
    </FieldShell>
  )
}
