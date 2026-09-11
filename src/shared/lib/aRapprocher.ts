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
  /**
   * Identifiant de la facture chez Pennylane. `null` = la charge a été saisie
   * ici et n'existe pas chez le comptable. Absent (`undefined`) = l'appelant
   * n'a pas selectionné la colonne, donc non compté (rétrocompat).
   */
  pennylane_id?: string | null
  /** Date de la charge, 'AAAA-MM-JJ'. Sert au délai de grâce ci-dessous. */
  date?: string
  /**
   * Immobilisation (migration 20260724100000) — un achat d'investissement
   * (véhicule…), jamais un débit Qonto "à rapprocher" au sens charge
   * d'exploitation. Absent (`undefined`) = considéré false (rétrocompat).
   */
  est_immobilisation?: boolean
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
  /** Charges qui n'existent QUE dans le site — jamais vues chez Pennylane. */
  hors_pennylane: number
  /** Avoirs fournisseur (montant_ttc_cts < 0) — à vérifier, ne se rapprochent
   *  jamais comme un débit Qonto. Purement informatif, PAS additionné au total. */
  avoirs: number
  /**
   * Total à rapprocher affiché sur le badge = tresorerie + encaissements +
   * categorisation + pennylane_supprimees + hors_pennylane. `charges` (miroir
   * de tresorerie) et `avoirs` (informatif) ne sont PAS additionnés.
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
 * - dont le RESTE DÛ (montant TTC − débits déjà rattachés) est encore > 0
 * - et dont ce reste tombe exactement sur un débit non rapproché
 *
 * On raisonne en reste dû et non en « liée / pas liée » : une facture réglée en
 * plusieurs fois (assurance annuelle prélevée mensuellement) reste à rapprocher
 * tant qu'elle n'est pas soldée. Même règle que l'écran Trésorerie, pour que le
 * compteur et l'écran ne racontent jamais deux histoires différentes.
 *
 * Renvoyer le nombre de charges (pas de débits) — l'utilisateur voit combien
 * de factures achat attendent d'être rattachées à un mouvement bancaire.
 */
export function countChargesArapprocher(txs: TxPick[], charges: ChargePick[]): number {
  const imputeParCharge = new Map<string, number>()
  for (const t of txs) {
    if (!t.charge_id || t.side !== 'debit') continue
    const n = Number(t.amount_cts)
    if (!Number.isFinite(n) || n <= 0) continue
    imputeParCharge.set(t.charge_id, (imputeParCharge.get(t.charge_id) ?? 0) + n)
  }

  const unreconciledDebitAmounts = new Set(
    txs.filter(t => t.side === 'debit' && !t.charge_id && !t.justif_type)
       .map(t => t.amount_cts),
  )

  return charges.filter(c => {
    if (c.montant_ttc_cts == null || c.montant_ttc_cts < 0) return false // avoirs exclus
    if (!isChargeQonto(c)) return false                                  // canaux hors Qonto
    if (c.est_immobilisation) return false                               // pas « à rapprocher »
    const reste = c.montant_ttc_cts - (imputeParCharge.get(c.id) ?? 0)
    return reste > 0 && unreconciledDebitAmounts.has(reste)
  }).length
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

/**
 * Charges qui n'existent QUE dans le site.
 *
 * Demande du président : « Je veux que ce qui se passe sur mon site soit la
 * copie parfaite en terme de saisie chez Pennylane. » Une charge sans
 * `pennylane_id` est précisément le contraire : elle est dans le site, elle
 * n'est pas chez le comptable, et rien ne le signalait jusqu'ici.
 *
 * DÉLAI DE GRÂCE de 14 jours, et il est indispensable : une facture arrive
 * chez Pennylane avec plusieurs jours de décalage (réception, traitement,
 * puis synchronisation). Sans ce délai, toute charge saisie le matin même
 * s'afficherait en écart l'après-midi, et le compteur crierait au loup en
 * permanence — on finirait par ne plus le regarder.
 *
 * Les immobilisations sont exclues : un achat de véhicule suit un circuit
 * comptable à part.
 *
 * `pennylane_id` absent (`undefined`) = colonne non sélectionnée par
 * l'appelant → non compté, comme les autres compteurs de ce module.
 */
export const DELAI_GRACE_PENNYLANE_JOURS = 14

/**
 * Le test unitaire, exporte a part.
 *
 * L'ecran Charges s'en sert pour filtrer la liste, ce module pour compter.
 * S'ils appliquaient chacun leur copie de la regle, le bandeau annoncerait un
 * nombre et la liste en montrerait un autre des que l'un des deux evoluerait.
 */
export function estChargeHorsPennylane(c: ChargePick, aujourdhui: Date): boolean {
  if (c.pennylane_id === undefined) return false   // colonne non selectionnee
  if (c.pennylane_id !== null) return false        // vient de Pennylane
  if (c.est_immobilisation) return false           // circuit comptable a part
  if (!c.date) return false                        // anciennete indeterminable
  const limite = new Date(aujourdhui.getTime() - DELAI_GRACE_PENNYLANE_JOURS * 86_400_000)
    .toISOString().slice(0, 10)
  return c.date <= limite
}

export function countChargesHorsPennylane(
  charges: ChargePick[],
  aujourdhui: Date = new Date(),
): number {
  return charges.filter(c => estChargeHorsPennylane(c, aujourdhui)).length
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
  aujourdhui: Date = new Date(),
): ARapprocherCounts {
  const tresorerie = countTresorerie(txs, allocations)
  const encaissements = countEncaissements(txs)
  const categorisation = countChargesNonCategorisees(charges)
  const pennylane_supprimees = countChargesPennylaneSupprimees(charges)
  const avoirs = countChargesAvoirs(charges)
  const hors_pennylane = countChargesHorsPennylane(charges, aujourdhui)
  return {
    tresorerie,
    charges: countChargesArapprocher(txs, charges),
    encaissements,
    categorisation,
    pennylane_supprimees,
    hors_pennylane,
    avoirs,
    total: tresorerie + encaissements + categorisation + pennylane_supprimees + hors_pennylane,
  }
}
