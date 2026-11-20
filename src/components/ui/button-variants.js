import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-[background-color,box-shadow,transform,filter,color,border-color] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-brand-gradient text-white shadow-(--shadow-button) hover:brightness-110 active:brightness-95',
        accent: 'bg-accent-600 text-white shadow-(--shadow-button) hover:bg-accent-700',
        outline: 'border border-line bg-surface text-ink shadow-sm hover:bg-brand-50 hover:border-brand-200',
        soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
        ghost: 'text-muted hover:bg-brand-50 hover:text-brand-700',
        danger: 'bg-rose-600 text-white shadow-(--shadow-button) hover:bg-rose-700',
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
