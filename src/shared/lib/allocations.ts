// Helpers purs autour de charge_allocations — aucune dépendance DB ni DOM.
// Deux dérivés utiles :
//   - chargeResteCts     : reste à allouer d'une charge (montant − Σ affectations)
//   - targetCouvertureCts: reste à couvrir d'une cible (Qonto / fuel / maintenance)
//
// Le "reste" se calcule côté application plutôt que via une vue SQL pour rester
// tolérant aux données legacy (charges sans allocations) et éviter une seconde
// source de vérité déviante en cas de modification manuelle.

/** Forme minimale d'une ligne charge_allocations pour ces helpers. */
export interface AllocationPick {
  amount_cts: number
  /** Cible pour targetCouvertureCts (facultatif quand on filtre en amont). */
  target_table?: 'qonto_transactions' | 'fuel_logs' | 'vehicle_maintenances'
  target_id?: string
}

/** Somme des allocations. Ignore les valeurs non finies / ≤ 0 (invariant du CHECK SQL). */
function sumAllocations(allocations: AllocationPick[] | null | undefined): number {
  if (!allocations || allocations.length === 0) return 0
  return allocations.reduce((s, a) => {
    const n = Number(a.amount_cts)
    return Number.isFinite(n) && n > 0 ? s + n : s
  }, 0)
}

/**
 * Reste à allouer d'une charge (en centimes) :
 *   montant TTC total − Σ allocations rattachées à cette charge.
 * `null` en entrée sur `montant_ttc_cts` → 0 (charge sans montant : rien à
 * allouer, aucune erreur).
 * Négatif possible en théorie si sur-allocation — plafonné à 0 pour l'UI.
 */
export function chargeResteCts(
  montant_ttc_cts: number | null | undefined,
  allocations: AllocationPick[] | null | undefined,
): number {
  const total = Number(montant_ttc_cts) || 0
  const reste = total - sumAllocations(allocations)
  return reste > 0 ? reste : 0
}

/**
 * Reste à couvrir d'une cible (débit Qonto / fuel_log / entretien) :
 *   montant total de la cible − Σ allocations qui la ciblent.
 * `allocations` est déjà filtré sur la cible côté appelant, ou on passe le
 * tableau complet avec `targetId` en second argument optionnel pour filtrage.
 */
export function targetCouvertureCts(
  targetAmountCts: number | null | undefined,
  allocations: AllocationPick[] | null | undefined,
  targetId?: string,
): number {
  const total = Number(targetAmountCts) || 0
  const relevantes = targetId
    ? (allocations ?? []).filter(a => a.target_id === targetId)
    : (allocations ?? [])
  const reste = total - sumAllocations(relevantes)
  return reste > 0 ? reste : 0
}
