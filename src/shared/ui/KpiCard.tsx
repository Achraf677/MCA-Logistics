import type { ReactNode } from 'react'

type Tone = 'neutral' | 'success' | 'info' | 'violet' | 'warning' | 'danger'

interface KpiCardProps {
  label: string
  value: string | number
  sub?: string
  tone?: Tone
  icon?: ReactNode
  delta?: { value: string; dir: 'up' | 'down' }
  /** @deprecated conservé pour compat — n'affecte plus la couleur */
  accent?: boolean
}

const tonePill: Record<Tone, string> = {
  neutral: 'bg-[var(--border)] text-[var(--text-muted)]',
  success: 'bg-[var(--success)]/15 text-[var(--success)]',
  info:    'bg-[var(--info)]/15 text-[var(--info)]',
  violet:  'bg-[var(--accent-violet)]/15 text-[var(--accent-violet)]',
  warning: 'bg-[var(--warning)]/15 text-[var(--warning)]',
  danger:  'bg-[var(--danger)]/15 text-[var(--danger)]',
}

export function KpiCard({ label, value, sub, tone = 'neutral', icon, delta }: KpiCardProps) {
  return (
    <div className="bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] px-5 py-4 flex flex-col gap-1 shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wider">{label}</span>
        {icon && (
          <span className={`w-8 h-8 rounded-[var(--r-md)] flex items-center justify-center shrink-0 ${tonePill[tone]}`}>
            {icon}
          </span>
        )}
      </div>
      <span className="font-mono font-semibold leading-none text-[var(--text)] mt-1" style={{ fontSize: 'var(--fs-kpi)' }}>
        {value}
      </span>
      {(delta || sub) && (
        <div className="flex items-center gap-2 mt-0.5">
          {delta && (
            <span className="text-[var(--fs-xs)] font-semibold font-mono" style={{ color: delta.dir === 'up' ? 'var(--success)' : 'var(--danger)' }}>
              {delta.dir === 'up' ? '▲' : '▼'} {delta.value}
            </span>
          )}
          {sub && <span className="text-[var(--fs-xs)] text-[var(--text-disabled)]">{sub}</span>}
        </div>
      )}
    </div>
  )
}
