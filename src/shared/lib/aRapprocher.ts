// Compteurs d'éléments « à rapprocher » — logique pure, testable.
//
// Modèle (rappel) — voir src/shared/lib/rapprochementQonto.ts pour la
// classification 1-à-1. Ici on agrège sur une liste :
//
//   (a) Trésorerie  = débits Qonto sans rapprochement
//                     side='debit' AND charge_id IS NULL AND justif_type IS NULL
//   (b) Charges     = charges NON liées à une qonto_transactions.charge_id ET
//                     dont montant_ttc_cts correspond à un débit (a). C'est le
//                     miroir de (a) — même « stock » d'actions, angle « charge ».
//                     Définition conservatrice : évite de compter les charges
//                     cash / pré-Qonto qui ne seront jamais rapprochées.
//   (c) Encaissements = crédits Qonto non identifiés
//                       side='credit' AND justif_type IS NULL
//
// Le total dans le badge = (a) + (c). (b) est affiché en détail mais NON
// additionné (doublon de (a)).

import { targetCouvertureCts, type AllocationPick } from './allocations'

/** Forme minimale d'une qonto_transaction lue par ces compteurs. */
export interface TxPick {
  /** Requis quand on croise avec charge_allocations (target_id = qonto_transactions.id). */
  id?: string
  side: 'debit' | 'credit'
  amount_cts: number
  charge_id: string | null
  justif_type: string | null
}

/** Forme minimale d'une charge lue par ces compteurs. */
export interface ChargePick {
  id: string
  montant_ttc_cts: number | null
  /** Optionnel : présent seulement quand on compte aussi la catégorisation. */
  category_id?: string | null
  /**
   * Canal de paiement (mise en place par la migration 20260716120000).
   * Absent (`undefined`) sur les données legacy pré-migration = interprété
   * comme 'qonto' pour rester rétrocompatible.
   */
  mode_paiement?: string | null
  /**
   * Horodatage "facture disparue de Pennylane" (migration 20260721120000).
   * Non-null = la facture a été supprimée côté Pennylane, action attendue
   * (supprimer de l'app ou conserver). Absent = non compté (rétrocompat).
   */
  pennylane_deleted_at?: string | null
}

/** Une charge est "candidate au rapprochement Qonto" uniquement si elle a été
 *  payée par Qonto. Les autres canaux (note de frais, cash, jetons prépayés,
 *  autre) n'auront JAMAIS de mouvement bancaire à rapprocher — inutile de les
 *  compter. Legacy sans `mode_paiement` renseigné = considéré 'qonto'. */
function isChargeQonto(c: ChargePick): boolean {
  return c.mode_paiement == null || c.mode_paiement === 'qonto'
}

export interface ARapprocherCounts {
  /** Débits Qonto sans rapprochement. */
  tresorerie: number
  /** Charges candidates au rapprochement (miroir de tresorerie, angle charge). */
  charges: number
  /** Crédits Qonto non identifiés. */
  encaissements: number
  /** Charges sans category_id (indépendant du rapprochement Qonto). */
  categorisation: number
  /** Charges dont la facture a été supprimée côté Pennylane (action attendue). */
  pennylane_supprimees: number
  /** Avoirs fournisseur (montant_ttc_cts < 0) — à vérifier, ne se rapprochent
   *  jamais comme un débit Qonto. Purement informatif, PAS additionné au total. */
  avoirs: number
  /**
   * Total à rapprocher affiché sur le badge = tresorerie + encaissements +
   * categorisation + pennylane_supprimees. `charges` (miroir de tresorerie) et
   * `avoirs` (informatif) ne sont PAS additionnés.
   */
  total: number
}

/** Débits sans rapprochement — angle transaction. Un débit est "à rapprocher"
 *  s'il n'a ni charge_id direct, ni justif_type, ET si aucune allocation ne
 *  couvre encore son montant (targetCouvertureCts > 0). Rétrocompat : sans
 *  `allocations`, comportement identique à avant. */
export function countTresorerie(txs: TxPick[], allocations: AllocationPick[] = []): number {
  const qontoAllocs = allocations.filter(a => a.target_table === 'qonto_transactions')
  return txs.filter(t => {
    if (t.side !== 'debit') return false
    if (t.charge_id) return false
    if (t.justif_type) return false
    // Si le débit est déjà entièrement alloué via charge_allocations, il sort.
    // Sans allocations = 0 conso = reste = amount_cts > 0 → toujours compté.
    if (!t.id) return true
    return targetCouvertureCts(t.amount_cts, qontoAllocs, t.id) > 0
  }).length
}

/** Crédits sans classification — angle transaction. */
export function countEncaissements(txs: TxPick[]): number {
  return txs.filter(t => t.side === 'credit' && !t.justif_type).length
}

/**
 * Charges candidates au rapprochement — angle charge :
 * - non déjà liées à une qonto_transaction (id absent de l'ensemble des charge_id)
 * - de montant_ttc_cts égal à un débit à rapprocher
 *
 * Renvoyer le nombre de charges (pas de débits) — l'utilisateur voit combien
 * de factures achat attendent d'être rattachées à un mouvement bancaire.
 */
export function countChargesArapprocher(txs: TxPick[], charges: ChargePick[]): number {
  const linkedChargeIds = new Set(
    txs.map(t => t.charge_id).filter((id): id is string => !!id),
  )
  const unreconciledDebitAmounts = new Set(
    txs.filter(t => t.side === 'debit' && !t.charge_id && !t.justif_type)
       .map(t => t.amount_cts),
  )
  return charges.filter(c =>
    c.montant_ttc_cts != null &&
    c.montant_ttc_cts >= 0 &&                       // exclut les avoirs (jamais un débit Qonto)
    isChargeQonto(c) &&                             // exclut les canaux hors Qonto
    !linkedChargeIds.has(c.id) &&
    unreconciledDebitAmounts.has(c.montant_ttc_cts),
  ).length
}

/** Charges dont `category_id` est explicitement null — indépendant du
 *  rapprochement Qonto. Les charges dont le champ est absent (`undefined`,
 *  cas rétrocompat où l'appelant n'a pas sélectionné category_id) ne sont
 *  pas comptées : la définition est stricte. */
export function countChargesNonCategorisees(charges: ChargePick[]): number {
  return charges.filter(c => c.category_id === null).length
}

/** Charges dont la facture a DISPARU de Pennylane (pennylane_deleted_at posé
 *  par l'Edge pennylane-sync). Champ absent (`undefined`) = non compté —
 *  rétrocompat avec les appels qui ne sélectionnent pas la colonne. */
export function countChargesPennylaneSupprimees(charges: ChargePick[]): number {
  return charges.filter(c => c.pennylane_deleted_at != null).length
}

/** Avoirs fournisseur — charges à montant négatif (venant de Pennylane ou
 *  saisies manuellement via le toggle "Avoir"). Jamais un débit Qonto. */
export function countChargesAvoirs(charges: ChargePick[]): number {
  return charges.filter(c => c.montant_ttc_cts != null && c.montant_ttc_cts < 0).length
}

/** Aggrégation complète — utilisée par le badge Dashboard + la cloche.
 *  `allocations` est optionnel (rétrocompat) : sans lui, comportement identique
 *  au pré-charge_allocations. */
export function countARapprocher(
  txs: TxPick[],
  charges: ChargePick[],
  allocations: AllocationPick[] = [],
): ARapprocherCounts {
  const tresorerie = countTresorerie(txs, allocations)
  const encaissements = countEncaissements(txs)
  const categorisation = countChargesNonCategorisees(charges)
  const pennylane_supprimees = countChargesPennylaneSupprimees(charges)
  const avoirs = countChargesAvoirs(charges)
  return {
    tresorerie,
    charges: countChargesArapprocher(txs, charges),
    encaissements,
    categorisation,
    pennylane_supprimees,
    avoirs,
    total: tresorerie + encaissements + categorisation + pennylane_supprimees,
  }
}
