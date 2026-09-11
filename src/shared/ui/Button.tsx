import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'icon'
type Size = 'default' | 'compact'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

// `press` (index.css) ajoute l'enfoncement au clic : le bouton recule
// legerement sous le doigt puis revient. C'est un `transform`, donc rien
// n'est recalcule dans la page — on ne retombe pas dans le bug des 10 fps.
// La duree de la transition de couleur passe de 120 a 200 ms avec une
// courbe amortie : 120 ms en lineaire, c'est ce que l'utilisateur
// decrivait comme « trop sec ».
const base =
  'press inline-flex items-center justify-center gap-1.5 font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]'

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-[var(--brand)] to-[var(--brand-deep)] text-white hover:from-[var(--brand-hover)] hover:to-[var(--brand)] rounded-[var(--r-md)] px-3 shadow-[0_8px_20px_-12px_rgba(255,61,77,.6)]',
  secondary:
    'bg-transparent border border-[var(--border)] text-[var(--text)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-card-hover)] rounded-[var(--r-md)] px-3',
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
