const TVA_STANDARDS = [0, 5.5, 10, 19, 20]
const TVA_TOLERANCE = 1.5

/**
 * Taux TVA dérivé des montants HT et TVA en centimes.
 * Fonctionne en valeur absolue (avoirs négatifs inclus).
 * Retourne 0 si tva=0 (exonéré/marge) ou ht=0.
 * Cale sur {0, 5.5, 10, 19, 20} ±1.5 ; hors tolérance → taux brut.
 */
export function snapVatRate(tvaCts: number, htCts: number): number {
  const absHt  = Math.abs(htCts)
  const absTva = Math.abs(tvaCts)
  if (absHt === 0 || absTva === 0) return 0
  const raw = Math.round(absTva / absHt * 1000) / 10
  let best: number | null = null
  let bestDist = Infinity
  for (const s of TVA_STANDARDS) {
    const dist = Math.abs(raw - s)
    if (dist <= TVA_TOLERANCE && dist < bestDist) { bestDist = dist; best = s }
  }
  return best ?? raw
}
