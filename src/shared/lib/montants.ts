export interface Montants {
  ht_cts: number
  tva_cts: number
  ttc_cts: number
  /** Taux recalculé pour info (peut différer du taux saisi si TVA surchargée manuellement) */
  rate: number
}

/** HT pilote + taux → TVA suggérée. TTC = HT + TVA. */
export function fromHtAndRate(ht_cts: number, rate: number): Montants {
  const ht = Math.max(0, Math.round(ht_cts))
  const tva = Math.round(ht * rate / 100)
  return { ht_cts: ht, tva_cts: tva, ttc_cts: ht + tva, rate }
}

/** TVA saisie manuellement — gardée telle quelle. TTC = HT + TVA. Taux recalculé pour info. */
export function fromHtAndManualTva(ht_cts: number, tva_cts: number): Montants {
  const ht = Math.max(0, Math.round(ht_cts))
  const tva = Math.max(0, Math.round(tva_cts))
  const rate = ht > 0 ? Math.round(tva / ht * 10000) / 100 : 0
  return { ht_cts: ht, tva_cts: tva, ttc_cts: ht + tva, rate }
}

/** TTC + taux → TVA suggérée, HT = TTC − TVA. Utilisé pour le carburant (TTC connu en premier). */
export function fromTtcAndRate(ttc_cts: number, rate: number): Montants {
  const ttc = Math.max(0, Math.round(ttc_cts))
  const ht = rate > 0 ? Math.round(ttc * 100 / (100 + rate)) : ttc
  const tva = ttc - ht
  return { ht_cts: ht, tva_cts: tva, ttc_cts: ttc, rate }
}

/** TTC + TVA manuels → HT = TTC − TVA. Taux recalculé pour info. */
export function fromTtcAndManualTva(ttc_cts: number, tva_cts: number): Montants {
  const ttc = Math.max(0, Math.round(ttc_cts))
  const tva = Math.max(0, Math.round(tva_cts))
  const ht = Math.max(0, ttc - tva)
  const rate = ht > 0 ? Math.round(tva / ht * 10000) / 100 : 0
  return { ht_cts: ht, tva_cts: tva, ttc_cts: ttc, rate }
}
