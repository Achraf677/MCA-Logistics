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

/** Forme minimale d'une transaction Qonto pour le calcul du reste dû. */
export interface TxPick {
  charge_id: string | null
  amount_cts: number
  side: string
}

/**
 * Reste dû de chaque charge : montant TTC − somme des DÉBITS déjà rattachés.
 *
 * Une facture peut être réglée en plusieurs fois (assurance annuelle prélevée
 * mensuellement, échéancier fournisseur…). Rien en base ne l'empêchait —
 * `qonto_transactions.charge_id` n'a pas de contrainte d'unicité — mais l'écran
 * écartait toute charge déjà liée, ce qui rendait le 2ᵉ prélèvement
 * irrattachable. On raisonne donc en reste dû, pas en « liée / pas liée ».
 *
 * Seuls les débits comptent : un crédit ne règle pas une charge.
 * Le reste est plafonné à 0 (une sur-imputation ne rouvre pas la facture).
 */
export function resteDuParCharge(
  allCharges: ChargePick[],
  txs: TxPick[],
): Map<string, number> {
  const impute = new Map<string, number>()
  for (const t of txs) {
    if (!t.charge_id || t.side !== 'debit') continue
    const n = Number(t.amount_cts)
    if (!Number.isFinite(n) || n <= 0) continue
    impute.set(t.charge_id, (impute.get(t.charge_id) ?? 0) + n)
  }

  const reste = new Map<string, number>()
  for (const c of allCharges) {
    const total = Number(c.montant_ttc_cts) || 0
    const r = total - (impute.get(c.id) ?? 0)
    reste.set(c.id, r > 0 ? r : 0)
  }
  return reste
}

/** Trie une liste de charges par proximité de date avec le débit. */
function trierParProximite(charges: ChargePick[], settledAt?: string | null): ChargePick[] {
  if (!settledAt) return charges
  const ref = new Date(settledAt).getTime()
  return [...charges].sort((a, b) =>
    Math.abs(new Date(a.date).getTime() - ref) -
    Math.abs(new Date(b.date).getTime() - ref)
  )
}

/**
 * Charges proposées d'office pour un débit : celles dont le RESTE DÛ tombe
 * exactement sur le montant du débit. Couvre le cas courant (une facture, un
 * prélèvement) comme la dernière échéance d'un échéancier.
 * Triées par proximité de date avec le débit (settledAt optionnel).
 */
export function getMatchingChargesForDebit(
  amountCts: number,
  allCharges: ChargePick[],
  resteParCharge: Map<string, number>,
  settledAt?: string | null,
): ChargePick[] {
  const matches = allCharges.filter(c => (resteParCharge.get(c.id) ?? 0) === amountCts)
  return trierParProximite(matches, settledAt)
}

/**
 * Toutes les charges encore ouvertes (reste dû > 0), pour le rattachement
 * manuel d'un montant qui ne tombe pas juste — typiquement une échéance
 * intermédiaire. Une charge soldée disparaît d'elle-même de la liste.
 */
export function getChargesOuvertes(
  allCharges: ChargePick[],
  resteParCharge: Map<string, number>,
  settledAt?: string | null,
): ChargePick[] {
  const ouvertes = allCharges.filter(c => (resteParCharge.get(c.id) ?? 0) > 0)
  return trierParProximite(ouvertes, settledAt)
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
