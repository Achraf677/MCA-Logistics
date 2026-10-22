import type { ReactNode } from 'react'

/** Libellé de carte, identique au Dashboard. */
const libelleCls = 'text-[0.6875rem] sm:text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]'

/**
 * Un chiffre de liste (Livraisons, Devis…) : même gabarit que les cartes du
 * Dashboard. Cliquable : le geste filtre la liste en dessous.
 */
export function ChiffreCarte({ libelle, icone, valeur, detail, ton, actif, onClick, titre }: {
  libelle: string
  icone: ReactNode
  valeur: string
  detail: ReactNode
  ton?: 'warning' | 'danger'
  actif?: boolean
  onClick: () => void
  titre: string
}) {
  const couleur = ton === 'danger' ? 'var(--danger)' : ton === 'warning' ? 'var(--warning)' : 'var(--text)'
  return (
    <button type="button" onClick={onClick} title={titre} aria-pressed={actif}
      className={`rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] p-3 text-left flex flex-col min-w-0 transition-colors hover:border-[var(--brand)] ${actif ? '!border-[var(--brand)]' : ''}`}>
      <span className={`inline-flex items-center gap-1.5 mb-2 min-h-[1.25rem] truncate ${libelleCls}`}>
        {icone} {libelle}
      </span>
      <span className="font-mono font-semibold text-base sm:text-2xl leading-tight truncate" style={{ color: couleur }}>{valeur}</span>
      <span className="mt-auto pt-1 text-[0.6875rem] sm:text-xs text-[var(--text-muted)] truncate">{detail}</span>
    </button>
  )
}
