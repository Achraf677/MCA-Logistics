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

// ── Lignes supplémentaires ───────────────────────────────────────────────────
// Vit dans shared/ pour être consommable partout (TVA, encaissement, relances,
// assistant IA, KPIs livraisons…) sans casser la règle « aucun import entre
// features/ ».
//
// Invariant : `extra_lines` est toujours un tableau (colonne DB NOT NULL
// DEFAULT '[]'). Les helpers acceptent quand même null/undefined pour tolérer
// les rows chargés partiellement ou avant migration.

/** Une ligne supplémentaire rattachée à une livraison (attente, retour à vide,
 *  forfait…). TVA propre à chaque ligne ; regroupées sur la même facture Pennylane. */
export interface DeliveryExtraLine {
  label: string
  quantity: number
  amount_ht_cts: number
  tva_rate: number
}

/** Source d'extras minimale — miroir de la colonne JSONB `deliveries.extra_lines`. */
export interface ExtraLinesSource {
  extra_lines?: DeliveryExtraLine[] | null
}

/** Clamp identique à `pennylane-invoice/index.ts` : quantity ≤ 0 ou non finie → 1.
 *  Garantit que les totaux locaux (dashboards, TVA, prévisualisation facture)
 *  correspondent exactement à ce que Pennylane facturera. */
function normalizeQty(q: unknown): number {
  const n = Number(q)
  return Number.isFinite(n) && n > 0 ? n : 1
}

export function extraLinesHtCts(lines: DeliveryExtraLine[] | null | undefined): number {
  if (!lines || lines.length === 0) return 0
  return lines.reduce((s, l) => {
    const qty = normalizeQty(l.quantity)
    return s + Math.round((Number(l.amount_ht_cts) || 0) * qty)
  }, 0)
}

/** TVA totale des extras — calcul ligne par ligne, arrondi TTC puis diff
 *  (même invariant que computeAmount : ht + tva ≡ ttc pour chaque ligne). */
export function extraLinesTvaCts(lines: DeliveryExtraLine[] | null | undefined): number {
  if (!lines || lines.length === 0) return 0
  return lines.reduce((s, l) => {
    const qty = normalizeQty(l.quantity)
    const ht = Math.round((Number(l.amount_ht_cts) || 0) * qty)
    const ttc = addTva(ht, (Number(l.tva_rate) || 0) / 100)
    return s + (ttc - ht)
  }, 0)
}

export function extraLinesTtcCts(lines: DeliveryExtraLine[] | null | undefined): number {
  return extraLinesHtCts(lines) + extraLinesTvaCts(lines)
}

/** HT total facturable = ligne principale + extras. */
export function deliveryTotalHtCts(row: AmountSource & ExtraLinesSource): number {
  return effectiveHtCts(row) + extraLinesHtCts(row.extra_lines)
}

/** TTC total facturable = ligne principale + extras. */
export function deliveryTotalTtcCts(row: AmountSource & ExtraLinesSource): number {
  return effectiveTtcCts(row) + extraLinesTtcCts(row.extra_lines)
}
