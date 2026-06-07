export function centimesToEuros(cts: number): number {
  return cts / 100
}

export function eurosToCentimes(euros: number): number {
  return Math.round(euros * 100)
}

export function formatMoney(cts: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cts / 100)
}

export function addTva(ht_cts: number, rate: number): number {
  return Math.round(ht_cts * (1 + rate))
}

// ── Montants effectifs (colonne v2 vs legacy) ────────────────────────────────

/** Source minimale de montants : colonnes v2 (`amount_*`) avec repli legacy (`montant_*`). */
export interface AmountSource {
  amount_ht_cts?: number | null
  montant_ht_cts?: number | null
  amount_ttc_cts?: number | null
  montant_ttc_cts?: number | null
}

/** Montant HT effectif — préfère la colonne v2, replie sur legacy. */
export function effectiveHtCts(row: AmountSource): number {
  return row.amount_ht_cts ?? row.montant_ht_cts ?? 0
}

/** Montant TTC effectif — préfère la colonne v2, replie sur legacy. */
export function effectiveTtcCts(row: AmountSource): number {
  return row.amount_ttc_cts ?? row.montant_ttc_cts ?? 0
}

/** Formatage centimes → euros FR (alias de formatMoney). */
export function formatCents(cts: number): string {
  return formatMoney(cts)
}
