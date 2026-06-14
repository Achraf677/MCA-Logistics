import type { ReactNode } from 'react'

type Color = 'success' | 'danger' | 'warning' | 'info' | 'muted' | 'purple'

const colorMap: Record<Color, string> = {
  success: 'bg-[var(--success)]/15 text-[var(--success)]',
  danger:  'bg-[var(--danger)]/15 text-[var(--danger)]',
  warning: 'bg-[var(--warning)]/15 text-[var(--warning)]',
  info:    'bg-[var(--info)]/15 text-[var(--info)]',
  muted:   'bg-[var(--border)] text-[var(--text-muted)]',
  purple:  'bg-purple-500/15 text-purple-600',
}

export function Badge({ children, color = 'muted' }: { children: ReactNode; color?: Color }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-[var(--r-sm)] text-[var(--fs-xs)] font-medium ${colorMap[color]}`}>
      {children}
    </span>
  )
}
