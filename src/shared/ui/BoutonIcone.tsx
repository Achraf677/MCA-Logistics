import type { ReactNode, ComponentType } from 'react'
import { Settings2 } from 'lucide-react'

/**
 * Bouton carré à pictogramme, bordé — le modèle retenu en revue 01 (Mes courses).
 *
 * Sert partout où un geste secondaire tient en une icône : réglages repliés,
 * période précédente / suivante, filtres. `actif` = état ouvert / sélectionné
 * (bordure et icône à la couleur de la marque). Toujours un `libelle` : il sert
 * d'aria-label ET d'infobulle, un pictogramme seul ne se lit pas au lecteur d'écran.
 */
export function BoutonIcone({
  icone: Icone = Settings2, libelle, onClick, actif = false, disabled = false,
  taille = 'md', className = '',
}: {
  icone?: ComponentType<{ size?: number }>
  libelle: string
  onClick: () => void
  actif?: boolean
  disabled?: boolean
  /** md = 40 px (cible tactile, en-têtes d'écran) · sm = 28 px (lignes de liste). */
  taille?: 'md' | 'sm'
  className?: string
}) {
  const dim = taille === 'sm' ? 'w-7 h-7 rounded-[var(--r-sm)]' : 'min-w-[40px] min-h-[40px] rounded-[var(--r-md)]'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={libelle}
      title={libelle}
      aria-pressed={actif}
      className={`${dim} shrink-0 inline-flex items-center justify-center border transition-colors
        disabled:opacity-30 disabled:cursor-not-allowed ${
        actif
          ? 'border-[var(--brand)] text-[var(--brand)]'
          : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
      } ${className}`}
    >
      <Icone size={taille === 'sm' ? 13 : 17} />
    </button>
  )
}

/**
 * Panneau des réglages repliés, ouvert par un `BoutonIcone` : ce qui se règle
 * une fois (appli GPS, affichage…) ne doit pas occuper l'écran tous les jours.
 */
export function PanneauReglages({ titre, children }: { titre?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 p-3 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)]">
      {titre && <span className="inline-flex items-center gap-1.5 text-[var(--fs-xs)] text-[var(--text-muted)]">{titre}</span>}
      {children}
    </div>
  )
}
