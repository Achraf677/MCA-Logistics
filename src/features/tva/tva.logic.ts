// Logique pure de la TVA — aucune dépendance DB ni DOM.
// Source des données brutes : getTvaData (tva.queries.ts).
// Ne renvoie que des NOMBRES (centimes). Le découpage trimestre/mois et le
// formatage (€) restent dans le composant.
// Règles de calcul —
//   - TVA collectée = deliveryTotalTtcCts − deliveryTotalHtCts (ligne principale
//     + lignes supp. facturées à Pennylane), avec amount_* prioritaire sur
//     legacy montant_* pour le principal ;
//   - null compté comme 0 ;
//   - tva_deductible_pct absent = 100 ;
//   - carburant FR : Math.round(tva_cts × pct / 100) par ligne ;
//   - charge liée à un fuel_log (linkedToFuel) → ignorée (déjà comptée côté carburant).
//
// La poche « TVA allemande » (8e directive) a été retirée le 11/09/2026 : aucune
// charge n'était concernée (116 charges, toutes en FR) et aucun plein n'était à
// 19 %. Elle encombrait l'écran pour un cas qui n'existe pas dans l'activité.
// La colonne `charges.tva_pays` est supprimée par la migration 20260911071000.

import {
  deliveryTotalHtCts, deliveryTotalTtcCts, type DeliveryExtraLine,
} from '../../shared/lib/money'

// ── Formes minimales des données brutes (seuls les champs lus comptent) ─────────

export interface TvaDelivery {
  amount_ht_cts?: number | null
  amount_ttc_cts?: number | null
  montant_ht_cts?: number | null
  montant_ttc_cts?: number | null
  extra_lines?: DeliveryExtraLine[] | null
}
export interface TvaCharge {
  tva_cts:     number | null
  linkedToFuel: boolean
  /** Immobilisation (migration 20260724100000) — jamais une charge d'exploitation,
   *  donc jamais de TVA déductible ici. Déjà filtrée côté requête (getTvaData) ;
   *  re-vérifiée ici en défense en profondeur. Absent = false (rétrocompat). */
  est_immobilisation?: boolean
}
export interface TvaFuel {
  tva_cts:            number | null
  tva_deductible_pct: number | null
}

export interface TvaRaw {
  deliveries: TvaDelivery[]
  charges:    TvaCharge[]
  fuel:       TvaFuel[]
}

export interface TvaResult {
  tvaCollecteeCts:          number
  tvaDeductibleChargesCts:  number // charges non liées, hors immobilisations → CA3
  tvaDeductibleCarburantCts: number // Σ round(tva_cts × pct/100) → CA3
  soldeCts:                 number // collectée − charges − carburant
}

// ── Calcul TVA ──────────────────────────────────────────────────────────────────

export function computeTva(raw: TvaRaw): TvaResult {
  const tvaCollecteeCts = raw.deliveries.reduce(
    (s, d) => s + (deliveryTotalTtcCts(d) - deliveryTotalHtCts(d)), 0
  )

  let tvaDeductibleChargesCts = 0
  for (const c of raw.charges) {
    if (c.linkedToFuel) continue       // déjà comptée via le fuel_log lié
    if (c.est_immobilisation) continue // investissement, pas une charge d'exploitation
    tvaDeductibleChargesCts += c.tva_cts ?? 0
  }

  let tvaDeductibleCarburantCts = 0
  for (const f of raw.fuel) {
    const pct = f.tva_deductible_pct ?? 100
    tvaDeductibleCarburantCts += Math.round((f.tva_cts ?? 0) * pct / 100)
  }

  const soldeCts = tvaCollecteeCts - tvaDeductibleChargesCts - tvaDeductibleCarburantCts

  return {
    tvaCollecteeCts,
    tvaDeductibleChargesCts,
    tvaDeductibleCarburantCts,
    soldeCts,
  }
}
