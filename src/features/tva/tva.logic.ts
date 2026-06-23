// Logique pure de la TVA — aucune dépendance DB ni DOM.
// Source des données brutes : getTvaData (tva.queries.ts).
// Ne renvoie que des NOMBRES (centimes). Le découpage trimestre/mois et le
// formatage (€) restent dans le composant.
// Règles de calcul —
//   - TVA collectée via effectiveTtcCts − effectiveHtCts (amount_* prioritaire, repli legacy montant_*) ;
//   - null compté comme 0 ;
//   - tva_deductible_pct absent = 100 ;
//   - carburant FR : Math.round(tva_cts × pct / 100) par ligne ;
//   - charge liée à un fuel_log (linkedToFuel) → ignorée (déjà comptée côté carburant) ;
//   - TVA DE (charges tva_pays='DE' ou fuel tva_rate=19) → poche séparée, hors solde CA3.

import { effectiveHtCts, effectiveTtcCts } from '../../shared/lib/money'

// ── Formes minimales des données brutes (seuls les champs lus comptent) ─────────

export interface TvaDelivery {
  amount_ht_cts?: number | null
  amount_ttc_cts?: number | null
  montant_ht_cts?: number | null
  montant_ttc_cts?: number | null
}
export interface TvaCharge {
  tva_cts:     number | null
  tva_pays:    string | null
  linkedToFuel: boolean
}
export interface TvaFuel {
  tva_cts:            number | null
  tva_deductible_pct: number | null
  tva_rate:           number | null
}

export interface TvaRaw {
  deliveries: TvaDelivery[]
  charges:    TvaCharge[]
  fuel:       TvaFuel[]
}

export interface TvaResult {
  tvaCollecteeCts:         number
  tvaDeductibleChargesFR:  number  // charges non liées, tva_pays ≠ 'DE' → CA3
  tvaDeductibleCarburantFR: number // fuel tva_rate ≠ 19 : Σ round(tva_cts × pct/100) → CA3
  tvaAllemandeCts:         number  // charges DE non liées + fuel tva_rate=19 → 8e directive
  soldeCts:                number  // collectée − chargesFR − carburantFR  (DE exclue)
}

// ── Calcul TVA ──────────────────────────────────────────────────────────────────

export function computeTva(raw: TvaRaw): TvaResult {
  const tvaCollecteeCts = raw.deliveries.reduce(
    (s, d) => s + (effectiveTtcCts(d) - effectiveHtCts(d)), 0
  )

  let tvaDeductibleChargesFR = 0
  let tvaAllemandeCts = 0

  for (const c of raw.charges) {
    if (c.linkedToFuel) continue  // déjà comptée via le fuel_log lié
    const tva = c.tva_cts ?? 0
    if (c.tva_pays === 'DE') {
      tvaAllemandeCts += tva
    } else {
      tvaDeductibleChargesFR += tva
    }
  }

  let tvaDeductibleCarburantFR = 0
  for (const f of raw.fuel) {
    const tvaCts = f.tva_cts ?? 0
    if (f.tva_rate === 19) {
      tvaAllemandeCts += tvaCts  // plein : récupération via règles DE
    } else {
      const pct = f.tva_deductible_pct ?? 100
      tvaDeductibleCarburantFR += Math.round(tvaCts * pct / 100)
    }
  }

  const soldeCts = tvaCollecteeCts - tvaDeductibleChargesFR - tvaDeductibleCarburantFR

  return {
    tvaCollecteeCts,
    tvaDeductibleChargesFR,
    tvaDeductibleCarburantFR,
    tvaAllemandeCts,
    soldeCts,
  }
}
