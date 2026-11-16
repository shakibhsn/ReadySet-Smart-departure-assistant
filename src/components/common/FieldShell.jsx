import { cn } from '@/lib/utils'

/** Label + control + hint/error wrapper shared by FormInput, FormSelect and FormTextarea. */
export function FieldShell({ id, label, error, hint, required, children, className }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
        {required && <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : (
        hint && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>
      )}
    </div>
  )
}
