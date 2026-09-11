import { useMemo } from 'react'
import { formatCents } from '../lib/money'
import {
  totauxParCategorie, lignesTotauxCategories,
  type ChargePourTotaux, type AllocationPourTotaux,
} from '../lib/totauxCategories'

interface Props {
  charges: ChargePourTotaux[]
  /** Ventilations des charges ci-dessus (une requête groupée côté appelant). */
  allocations: AllocationPourTotaux[]
  /** id → nom, pour afficher « AdBlue » plutôt qu'un identifiant. */
  nomsParCategorie: Map<string, string>
}

/**
 * Combien a été dépensé dans chaque catégorie, sur le périmètre affiché.
 *
 * Une facture ventilée compte dans plusieurs catégories à la fois (lave-glace
 * + AdBlue sur une même facture de station) : c'est tout l'intérêt, et c'est
 * `totauxParCategorie` qui s'en charge.
 *
 * Le total général est rappelé en pied : sans lui, impossible de vérifier que
 * la somme des lignes correspond bien aux dépenses de la période.
 */
export function TotauxParCategorie({ charges, allocations, nomsParCategorie }: Props) {
  const lignes = useMemo(
    () => lignesTotauxCategories(totauxParCategorie(charges, allocations), nomsParCategorie),
    [charges, allocations, nomsParCategorie],
  )

  if (lignes.length === 0) {
    return (
      <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">
        Aucune dépense sur la période sélectionnée.
      </p>
    )
  }

  const general = lignes.reduce((s, l) => s + l.total_cts, 0)

  return (
    <div className="flex flex-col gap-2">
      {lignes.map(l => (
        <div key={l.category_id ?? '__sans__'} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className={`text-[var(--fs-sm)] truncate ${
              l.category_id === null ? 'text-[var(--text-muted)] italic' : 'text-[var(--text)]'
            }`}>
              {l.nom}
            </span>
            <span className="font-mono text-[var(--fs-sm)] text-[var(--text)] shrink-0">
              {formatCents(l.total_cts)}
            </span>
          </div>
          {/* Barre de proportion : lire l'écart entre postes sans comparer des
              chiffres un à un. Purement décorative, d'où aria-hidden. */}
          <div className="h-1 rounded-full bg-[var(--border)] overflow-hidden" aria-hidden="true">
            <div
              className={`h-full rounded-full ${
                l.category_id === null ? 'bg-[var(--text-disabled)]' : 'bg-[var(--brand)]'
              }`}
              style={{ width: `${Math.round(l.part * 100)}%` }}
            />
          </div>
        </div>
      ))}

      <div className="flex items-baseline justify-between gap-3 pt-2 mt-1 border-t border-[var(--border)]">
        <span className="text-[var(--fs-sm)] font-medium text-[var(--text)]">Total</span>
        <span className="font-mono text-[var(--fs-sm)] font-semibold text-[var(--text)]">
          {formatCents(general)}
        </span>
      </div>
    </div>
  )
}
