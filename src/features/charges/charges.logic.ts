import type { ChargeRow } from './charges.types'

export { formatCents } from '../../shared/lib/money'
export { categoryColor } from '../../shared/lib/categories'

export function computeTtcCts(htCts: number, tvaRate: number): number {
  return htCts + Math.round((htCts * tvaRate) / 100)
}

export function kpiSummary(rows: ChargeRow[]) {
  // Immobilisations : peuvent être affichées dans la liste (toggle "Afficher
  // les immobilisations") mais ne comptent JAMAIS dans les totaux d'exploitation.
  const exploitation = rows.filter(r => !r.est_immobilisation)

  const totalHtCts  = exploitation.reduce((s, r) => s + r.montant_ht_cts, 0)
  const totalTtcCts = exploitation.reduce((s, r) => s + (r.montant_ttc_cts ?? r.montant_ht_cts), 0)
  const byCategory  = exploitation.reduce<Record<string, number>>((acc, r) => {
    const key = r.charge_categories?.slug ?? 'autre'
    acc[key] = (acc[key] ?? 0) + r.montant_ht_cts
    return acc
  }, {})
  // Avoirs (montant_ht_cts < 0) — visibilité sur la réduction qu'ils apportent
  // aux totaux ci-dessus, sans les exclure du calcul (le signe fait foi).
  const avoirs = exploitation.filter(r => r.montant_ht_cts < 0)
  const nbAvoirs = avoirs.length
  const avoirsHtCts = avoirs.reduce((s, r) => s + r.montant_ht_cts, 0)
  return { totalHtCts, totalTtcCts, nb: exploitation.length, byCategory, nbAvoirs, avoirsHtCts }
}

// ── Boîte des justificatifs (dépenses déclarées, lot S1) ────────────────────

/** Filtre « Notes de frais à rembourser » : payées de la poche du déclarant. */
export function ticketsAffiches<T extends { moyen_paiement?: string | null }>(tickets: T[], notesDeFraisSeules: boolean): T[] {
  return notesDeFraisSeules ? tickets.filter(t => t.moyen_paiement === 'personnel') : tickets
}

/** 'AAAA-MM-JJ' → 'JJ/MM/AAAA' (sans passer par UTC) ; null si absent. */
export function jourFr(iso: string | null | undefined): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}
