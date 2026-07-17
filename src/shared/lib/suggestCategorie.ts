// Suggestion déterministe de catégorie de charge par fournisseur.
// Aucune dépendance DB ni DOM, aucun appel réseau. 100 % pure et testable.
//
// Règle :
//   - Regarder l'historique des charges du MÊME fournisseur.
//   - Compter les occurrences par category_id (ignorer les charges sans catégorie).
//   - Si une catégorie domine : fréquence ≥ 60 % ET au moins 2 occurrences → suggérer.
//   - Sinon → null (pas de suggestion).
//
// Signification métier :
//   - Un fournisseur qui apparaît toujours en "Carburant" reçoit auto-catégorisation
//     à haute confiance dès la 2e occurrence identique.
//   - Un fournisseur mixte (ex. E.LECLERC entre carburant / repas / entretien)
//     ne reçoit pas de suggestion tant qu'aucune catégorie ne domine réellement.

/** Historique minimal utilisé par le moteur — pas d'import cross-feature. */
export interface ChargeHistoryItem {
  supplier_id: string | null
  category_id: string | null
}

/** Seuil de fréquence pour proposer une suggestion (60 %). */
export const SUGGEST_MIN_RATIO = 0.6

/** Nombre minimal d'occurrences catégorisées du même fournisseur avant de suggérer. */
export const SUGGEST_MIN_COUNT = 2

/**
 * Renvoie l'id de la catégorie suggérée pour `supplierId`, ou null si :
 * - fournisseur inconnu / pas d'historique catégorisé
 * - moins de 2 charges catégorisées de ce fournisseur
 * - aucune catégorie n'atteint 60 % des occurrences
 *
 * Ties : en cas d'égalité stricte au sommet, on renvoie null (pas de choix
 * fiable). L'utilisateur reste maître de la catégorisation.
 */
export function suggestCategory(
  supplierId: string | null,
  history: ChargeHistoryItem[],
): string | null {
  if (!supplierId) return null

  // Filtre : même fournisseur, catégorie renseignée.
  const relevant = history.filter(
    h => h.supplier_id === supplierId && h.category_id != null,
  )

  if (relevant.length < SUGGEST_MIN_COUNT) return null

  // Comptage par category_id.
  const counts = new Map<string, number>()
  for (const h of relevant) {
    const id = h.category_id as string
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  // Recherche du maximum + détection d'égalité au sommet.
  let bestId: string | null = null
  let bestCount = 0
  let tieAtTop = false
  for (const [id, c] of counts.entries()) {
    if (c > bestCount) {
      bestId = id
      bestCount = c
      tieAtTop = false
    } else if (c === bestCount) {
      tieAtTop = true
    }
  }

  if (tieAtTop) return null

  // Vérif seuils : ratio ET count.
  const ratio = bestCount / relevant.length
  if (ratio < SUGGEST_MIN_RATIO) return null
  if (bestCount < SUGGEST_MIN_COUNT) return null

  return bestId
}
