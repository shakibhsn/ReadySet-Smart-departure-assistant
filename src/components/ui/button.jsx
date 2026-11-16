import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { buttonVariants } from './button-variants'

export function Button({ className, variant, size, type = 'button', ...props }) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

/** Router link styled as a button (avoids invalid <a> inside <button>). */
export function ButtonLink({ className, variant, size, ...props }) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
