// Logique pure du rapprochement Qonto↔charges. Aucune dépendance DB ni DOM.
import type { ChargePick } from '../types/charges'

export type DebitStatus = 'justifie' | 'a_rapprocher' | 'sans_justificatif'

/**
 * Charges disponibles pour rapprocher un débit donné :
 * même montant TTC exact, non déjà liées à une autre transaction.
 * Triées par proximité de date avec le débit (settledAt optionnel).
 */
export function getMatchingChargesForDebit(
  amountCts: number,
  allCharges: ChargePick[],
  linkedChargeIds: Set<string>,
  settledAt?: string | null,
): ChargePick[] {
  const matches = allCharges.filter(
    c => c.montant_ttc_cts === amountCts && !linkedChargeIds.has(c.id)
  )
  if (!settledAt) return matches
  const ref = new Date(settledAt).getTime()
  return [...matches].sort((a, b) =>
    Math.abs(new Date(a.date).getTime() - ref) -
    Math.abs(new Date(b.date).getTime() - ref)
  )
}

/** Classement d'un débit selon son état de rapprochement. */
export function classifyDebit(chargeId: string | null, matchCount: number): DebitStatus {
  if (chargeId) return 'justifie'
  if (matchCount > 0) return 'a_rapprocher'
  return 'sans_justificatif'
}
