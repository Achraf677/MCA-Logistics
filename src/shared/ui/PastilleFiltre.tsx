import type { ReactNode } from 'react'

/** Filtre en pastille à bascule (« Actifs uniquement », « Avec encours »…) : s'allume à la marque quand il est actif. */
export function PastilleFiltre({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={actif} onClick={onClick}
      className={`h-9 px-3.5 rounded-full border text-sm font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-all duration-200 press
        ${actif
          ? 'border-[var(--brand)] bg-[var(--brand)]/12 text-[var(--brand)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_12%,transparent)]'
          : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border-strong)]'}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full transition-colors ${actif ? 'bg-[var(--brand)]' : 'bg-[var(--text-disabled)]'}`} />
      {children}
    </button>
  )
}
