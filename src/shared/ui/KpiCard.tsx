interface KpiCardProps {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
}

export function KpiCard({ label, value, sub, accent }: KpiCardProps) {
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] px-5 py-4 flex flex-col gap-1">
      <span className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wider">{label}</span>
      <span
        className="font-mono font-semibold leading-none"
        style={{ fontSize: 'var(--fs-kpi)', color: accent ? 'var(--brand)' : 'var(--text)' }}
      >
        {value}
      </span>
      {sub && <span className="text-[var(--fs-xs)] text-[var(--text-disabled)]">{sub}</span>}
    </div>
  )
}
