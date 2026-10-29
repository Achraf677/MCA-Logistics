import type { ReactNode } from 'react'

/** Tuile de statut compacte : cliquable, sélectionnée = bordure neutre (pas de rouge : il est réservé au danger). */
export function TuileStatut({ libelle, icone, valeur, detail, ton, actif, onClick, titre }: {
  libelle: string
  icone: ReactNode
  valeur: string
  detail: ReactNode
  ton?: 'warning' | 'danger'
  actif: boolean
  onClick: () => void
  titre: string
}) {
  const couleur = ton === 'danger' ? 'var(--danger)' : ton === 'warning' ? 'var(--warning)' : 'var(--text)'
  return (
    <button type="button" onClick={onClick} title={titre} aria-pressed={actif}
      className={`rounded-[var(--r-lg)] border bg-[var(--bg-card)] px-3 py-2 text-left flex flex-col min-w-0 transition-colors hover:border-[var(--border-strong)] ${
        actif ? 'border-[var(--text-muted)] bg-[var(--bg-elevated)]' : 'border-[var(--border)]'}`}>
      <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-muted)] truncate">{icone} {libelle}</span>
      <span className="font-mono font-semibold text-xl leading-tight truncate" style={{ color: couleur }}>{valeur}</span>
      <span className="text-[0.6875rem] text-[var(--text-muted)] truncate">{detail}</span>
    </button>
  )
}
