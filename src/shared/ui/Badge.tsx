import type { ReactNode } from 'react'

type Color = 'success' | 'danger' | 'warning' | 'info' | 'muted' | 'purple'

const colorMap: Record<Color, string> = {
  success: 'bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]/35',
  danger:  'bg-[var(--danger)]/15 text-[var(--danger)] border-[var(--danger)]/35',
  warning: 'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/35',
  info:    'bg-[var(--info)]/15 text-[var(--info)] border-[var(--info)]/35',
  muted:   'bg-[var(--text-muted)]/12 text-[var(--text-muted)] border-[var(--text-muted)]/30',
  purple:  'bg-[var(--accent-violet)]/15 text-[var(--accent-violet)] border-[var(--accent-violet)]/35',
}

export function Badge({ children, color = 'muted' }: { children: ReactNode; color?: Color }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-[var(--r-pill)] text-[var(--fs-xs)] font-semibold border ${colorMap[color]}`}>
      {children}
    </span>
  )
}
