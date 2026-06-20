import type { ReactNode } from 'react'

type Tone = 'neutral' | 'success' | 'info' | 'violet' | 'warning' | 'danger'

interface KpiCardProps {
  label: string
  value: string | number
  sub?: string
  tone?: Tone
  icon?: ReactNode
  delta?: { value: string; dir: 'up' | 'down' }
  progress?: number
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

const toneHoverBorder: Record<Tone, string> = {
  neutral: 'hover:border-[var(--border-strong)]',
  success: 'hover:border-[var(--success)]/45',
  info:    'hover:border-[var(--info)]/45',
  violet:  'hover:border-[var(--accent-violet)]/45',
  warning: 'hover:border-[var(--warning)]/45',
  danger:  'hover:border-[var(--danger)]/45',
}

const toneGradient: Record<Tone, string> = {
  neutral: 'linear-gradient(90deg, var(--text-disabled), var(--text-muted))',
  success: 'linear-gradient(90deg, #1fd18e, #13b8a6)',
  info:    'linear-gradient(90deg, #4c8dff, #234d9e)',
  violet:  'linear-gradient(90deg, #9b8cff, #6c5ce7)',
  warning: 'linear-gradient(90deg, #ffb020, #f5860b)',
  danger:  'linear-gradient(90deg, #ff5247, #e63946)',
}

export function KpiCard({ label, value, sub, tone = 'neutral', icon, delta, progress }: KpiCardProps) {
  return (
    <div className={`bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] px-5 py-4 flex flex-col gap-1 shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-1 ${toneHoverBorder[tone]}`}>
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
      {progress !== undefined && (
        <div className="mt-2 h-1.5 rounded-full bg-[var(--bg-deep)] overflow-hidden">
          <div className="h-full rounded-full transition-[width] duration-500"
               style={{ width: `${Math.max(0, Math.min(100, progress))}%`, background: toneGradient[tone] }} />
        </div>
      )}
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
