// Compteurs « à traiter » côté Charges — logique pure, testable. (Le rapprochement bancaire par ligne
// a été retiré le 22/10/2026 : plus de compteurs Trésorerie / Encaissements.)

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

export interface ARapprocherCounts {
  /** Charges sans category_id. */
  categorisation: number
  /** Charges dont la facture a été supprimée côté Pennylane (action attendue). */
  pennylane_supprimees: number
  /** Charges qui n'existent QUE dans le site — jamais vues chez Pennylane. */
  hors_pennylane: number
  /** Avoirs fournisseur (montant_ttc_cts < 0) — à vérifier. Informatif, PAS additionné au total. */
  avoirs: number
  /** Total affiché sur le badge = categorisation + pennylane_supprimees + hors_pennylane. */
  total: number
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

/** Agrégation complète — badge Dashboard + cloche. */
export function countARapprocher(charges: ChargePick[], aujourdhui: Date = new Date()): ARapprocherCounts {
  const categorisation = countChargesNonCategorisees(charges)
  const pennylane_supprimees = countChargesPennylaneSupprimees(charges)
  const avoirs = countChargesAvoirs(charges)
  const hors_pennylane = countChargesHorsPennylane(charges, aujourdhui)
  return {
    categorisation, pennylane_supprimees, hors_pennylane, avoirs,
    total: categorisation + pennylane_supprimees + hors_pennylane,
  }
}
