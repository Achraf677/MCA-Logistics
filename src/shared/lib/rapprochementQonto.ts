// Logique pure du rapprochement Qonto↔charges. Aucune dépendance DB ni DOM.
import type { ChargePick } from '../types/charges'

/** Toutes les valeurs autorisées dans qonto_transactions.justif_type. */
export type JustifType =
  | 'cca' | 'frais_bancaire' | 'hors_activite'   // débits
  | 'client' | 'remboursement' | 'autre'          // crédits

/** Nature d'un crédit Qonto — sous-ensemble de JustifType. */
export type CreditTag = 'client' | 'cca' | 'remboursement' | 'autre'

export type DebitStatus =
  | 'justifie_charge'    // charge Pennylane liée
  | 'justifie_type'      // tag manuel (CCA / frais / perso)
  | 'a_rapprocher'       // charge au même montant disponible, non encore liée
  | 'sans_justificatif'  // aucune piste

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
export function classifyDebit(
  chargeId: string | null,
  justifType: string | null,
  matchCount: number,
): DebitStatus {
  if (chargeId) return 'justifie_charge'
  if (justifType) return 'justifie_type'
  if (matchCount > 0) return 'a_rapprocher'
  return 'sans_justificatif'
}

/** Normalise une chaîne : minuscules, sans accents, espaces normalisés. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/**
 * Suggestion automatique du type de justificatif DÉBIT.
 * Règles (ordre prioritaire) :
 *  1. CCA          : operationType === 'transfer' ET tous les mots du nom d'associé présents
 *  2. frais_bancaire : operationType === 'qonto_fee' OU libellé contient 'qonto'
 *  3. null         : hors_activite est toujours manuel
 */
export function suggestJustifType(
  label: string | null,
  operationType: string | null,
  associeNames: string[],
): JustifType | null {
  const normLabel = normalise(label ?? '')
  const normOp = (operationType ?? '').toLowerCase()

  if (normOp === 'transfer') {
    for (const name of associeNames) {
      const words = normalise(name).split(/\s+/).filter(Boolean)
      if (words.length > 0 && words.every(w => normLabel.includes(w))) return 'cca'
    }
  }

  if (normOp === 'qonto_fee' || normLabel.includes('qonto')) return 'frais_bancaire'

  return null
}

/** Classement d'un crédit selon son état d'identification. */
export function classifyCredit(justifType: string | null): 'identifie' | 'non_identifie' {
  return justifType ? 'identifie' : 'non_identifie'
}

/**
 * Suggestion automatique de la nature d'un CRÉDIT.
 * Règles (ordre prioritaire) :
 *  1. 'cca'    : nom d'associé présent dans le libellé, QUEL QUE SOIT operationType
 *               (les apports arrivent en 'income', pas uniquement en 'transfer')
 *  2. 'client' : nom de client (mots, casse/accents ignorés) dans le libellé
 *  3. null     : remboursement / autre = toujours manuel
 */
export function suggestCreditTag(
  label: string | null,
  _operationType: string | null,
  clientNames: string[],
  associeNames: string[],
): CreditTag | null {
  const normLabel = normalise(label ?? '')

  // CCA : apport d'associé — quel que soit le type d'opération Qonto
  for (const name of associeNames) {
    const words = normalise(name).split(/\s+/).filter(Boolean)
    if (words.length > 0 && words.every(w => normLabel.includes(w))) return 'cca'
  }

  // Client : paiement reçu d'un client
  for (const name of clientNames) {
    const words = normalise(name).split(/\s+/).filter(Boolean)
    if (words.length > 0 && words.every(w => normLabel.includes(w))) return 'client'
  }

  return null
}
