// Logique pure de la TVA — aucune dépendance DB ni DOM.
// Source des données brutes : getTvaData (tva.queries.ts).
// Ne renvoie que des NOMBRES (centimes). Le découpage trimestre/mois et le
// formatage (€) restent dans le composant.
// Règles de calcul —
//   - TVA collectée via effectiveTtcCts − effectiveHtCts (amount_* prioritaire, repli legacy montant_*) ;
//   - null compté comme 0 ;
//   - tva_deductible_pct absent = 100 ;
//   - carburant : Math.round(tva_cts × pct / 100) par ligne.

import { effectiveHtCts, effectiveTtcCts } from '../../shared/lib/money'

// ── Formes minimales des données brutes (seuls les champs lus comptent) ─────────

export interface TvaDelivery {
  amount_ht_cts?: number | null
  amount_ttc_cts?: number | null
  montant_ht_cts?: number | null
  montant_ttc_cts?: number | null
}
export interface TvaCharge {
  tva_cts: number | null
}
export interface TvaFuel {
  tva_cts: number | null
  tva_deductible_pct: number | null
}

export interface TvaRaw {
  deliveries: TvaDelivery[]
  charges: TvaCharge[]
  fuel: TvaFuel[]
}

export interface TvaResult {
  tvaCollecteeCts: number
  tvaDeductibleCharges: number
  tvaDeductibleCarburant: number
  soldeCts: number
}

// ── Calcul TVA ──────────────────────────────────────────────────────────────────

export function computeTva(raw: TvaRaw): TvaResult {
  const tvaCollecteeCts = raw.deliveries.reduce(
    (s, d) => s + (effectiveTtcCts(d) - effectiveHtCts(d)), 0
  )
  const tvaDeductibleCharges = raw.charges.reduce(
    (s, c) => s + ((c.tva_cts as number) ?? 0), 0
  )
  const tvaDeductibleCarburant = raw.fuel.reduce((s, f) => {
    const tvaCts = (f.tva_cts as number) ?? 0
    const pct    = (f.tva_deductible_pct as number) ?? 100
    return s + Math.round(tvaCts * pct / 100)
  }, 0)
  const soldeCts = tvaCollecteeCts - tvaDeductibleCharges - tvaDeductibleCarburant

  return { tvaCollecteeCts, tvaDeductibleCharges, tvaDeductibleCarburant, soldeCts }
}
