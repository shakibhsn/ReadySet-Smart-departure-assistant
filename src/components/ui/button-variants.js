import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800',
        accent: 'bg-accent-600 text-white shadow-sm hover:bg-accent-700',
        outline: 'border border-line bg-surface text-ink hover:bg-brand-50 hover:border-brand-200',
        soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
        ghost: 'text-muted hover:bg-brand-50 hover:text-brand-700',
        danger: 'bg-rose-600 text-white hover:bg-rose-700',
      },
      size: {
        sm: 'h-9 px-3.5',
        default: 'h-11 px-5',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)
