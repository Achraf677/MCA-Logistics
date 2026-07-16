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

/** Forme minimale d'une qonto_transaction lue par ces compteurs. */
export interface TxPick {
  side: 'debit' | 'credit'
  amount_cts: number
  charge_id: string | null
  justif_type: string | null
}

/** Forme minimale d'une charge lue par ces compteurs. */
export interface ChargePick {
  id: string
  montant_ttc_cts: number | null
}

export interface ARapprocherCounts {
  /** Débits Qonto sans rapprochement. */
  tresorerie: number
  /** Charges candidates au rapprochement (miroir de tresorerie, angle charge). */
  charges: number
  /** Crédits Qonto non identifiés. */
  encaissements: number
  /**
   * Total à rapprocher affiché sur le badge = tresorerie + encaissements.
   * `charges` n'est PAS additionné (miroir de tresorerie).
   */
  total: number
}

/** Débits sans rapprochement — angle transaction. */
export function countTresorerie(txs: TxPick[]): number {
  return txs.filter(t => t.side === 'debit' && !t.charge_id && !t.justif_type).length
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
    !linkedChargeIds.has(c.id) &&
    unreconciledDebitAmounts.has(c.montant_ttc_cts),
  ).length
}

/** Aggrégation complète — utilisée par le badge Dashboard + la cloche. */
export function countARapprocher(txs: TxPick[], charges: ChargePick[]): ARapprocherCounts {
  const tresorerie = countTresorerie(txs)
  const encaissements = countEncaissements(txs)
  return {
    tresorerie,
    charges: countChargesArapprocher(txs, charges),
    encaissements,
    total: tresorerie + encaissements,
  }
}
