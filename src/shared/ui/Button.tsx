import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'icon'
type Size = 'default' | 'compact'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

const base =
  'inline-flex items-center justify-center gap-1.5 font-medium transition-colors duration-[120ms] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]'

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] rounded-[var(--r-md)] px-3',
  secondary:
    'bg-transparent border border-[var(--border-soft)] text-[var(--text)] hover:bg-[var(--bg-card-hover)] rounded-[var(--r-md)] px-3',
  ghost:
    'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)] rounded-[var(--r-md)] px-2',
  icon: 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)] rounded-[var(--r-md)] p-1.5',
}

const sizes: Record<Size, string> = {
  default: 'h-8 text-[var(--fs-sm)]',
  compact: 'h-7 text-[var(--fs-sm)]',
}

export function Button({ variant = 'secondary', size = 'default', className = '', children, ...props }: ButtonProps) {
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  )
}
