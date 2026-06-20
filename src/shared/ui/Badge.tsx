import type { ReactNode } from 'react'

type Color = 'success' | 'danger' | 'warning' | 'info' | 'muted' | 'purple'

const colorMap: Record<Color, string> = {
  success: 'bg-[var(--success)]/20 text-[var(--success)]',
  danger:  'bg-[var(--danger)]/20 text-[var(--danger)]',
  warning: 'bg-[var(--warning)]/20 text-[var(--warning)]',
  info:    'bg-[var(--info)]/20 text-[var(--info)]',
  muted:   'bg-[var(--border)] text-[var(--text-muted)]',
  purple:  'bg-[var(--accent-violet)]/20 text-[var(--accent-violet)]',
}

export function Badge({ children, color = 'muted' }: { children: ReactNode; color?: Color }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-[var(--r-pill)] text-[var(--fs-xs)] font-medium ${colorMap[color]}`}>
      {children}
    </span>
  )
}
