// TTC dû d'une course côté Edge — PUR, MIROIR de `deliveryTotalTtcCts`
// (src/shared/lib/money.ts), test de parité dans `totaux.test.ts` (lot U5).
// Ligne principale TTC stockée + suppléments (TVA ligne par ligne) ; en
// autoliquidation, aucune TVA : suppléments au HT.

export interface CourseMontants {
  amount_ht_cts?: number | null;
  amount_ttc_cts?: number | null;
  autoliquidation?: boolean | null;
  extra_lines?: unknown;
}

function qte(q: unknown): number {
  const n = Number(q);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** TTC total facturable (centimes) ; null si le TTC de la ligne principale est inconnu. */
export function totalTtcCourseCts(c: CourseMontants): number | null {
  if (c.amount_ttc_cts == null) return null;
  const autoliq = c.autoliquidation === true;
  const extras = Array.isArray(c.extra_lines) ? c.extra_lines as Array<Record<string, unknown>> : [];
  let total = Number(c.amount_ttc_cts);
  for (const l of extras) {
    const ht = Math.round((Number(l?.amount_ht_cts) || 0) * qte(l?.quantity));
    total += autoliq ? ht : Math.round(ht * (1 + (Number(l?.tva_rate) || 0) / 100));
  }
  return total;
}
