// Logique pure des Statistiques — aucune dépendance DB ni DOM.
// Source des données brutes : getStatistiquesData (statistiques.queries.ts).
// Ne renvoie que des nombres / structures. Le formatage (€) et les « max » d'affichage
// (hauteurs de barres) restent dans le composant.
// ISO : un montant null compte comme 0 (mirroir de la coercion JS du calcul inline).

import { effectiveHtCts } from '../../shared/lib/money'

// ── Formes minimales des données brutes (seuls les champs lus comptent) ─────────

export interface StatDelivery {
  date: string | null
  amount_ht_cts?: number | null
  montant_ht_cts?: number | null
  client_id: string | null
  clients: { name: string } | null
}
export interface StatCharge {
  date: string | null
  montant_ht_cts: number | null
  charge_categories: { name: string; slug: string } | null
}
export interface StatFuel { date: string | null; total_cts: number | null }
export interface StatMaintenance { date: string | null; cost_cts: number | null }

export interface StatistiquesData {
  deliveries: StatDelivery[]
  charges: StatCharge[]
  fuel: StatFuel[]
  maintenances: StatMaintenance[]
  year: number
}

export interface MonthCa { month: number; cts: number }
export interface ClientCa { name: string; cts: number }
export interface AnnualTotals {
  caTotal: number
  chargesTotal: number
  fuelTotal: number
  maintenanceTotal: number
}

// ── CA HT mensuel ────────────────────────────────────────────────────────────────

/** 12 lignes { month: 0..11, cts } : CA HT par mois (fuseau local, comme le calcul inline). */
export function caMensuel(deliveries: StatDelivery[]): MonthCa[] {
  return Array.from({ length: 12 }, (_, month): MonthCa => {
    const cts = deliveries
      .filter(d => new Date(d.date as string).getMonth() === month)
      .reduce((s, d) => s + effectiveHtCts(d), 0)
    return { month, cts }
  })
}

// ── Totaux annuels ──────────────────────────────────────────────────────────────

export function annualTotals(data: Pick<StatistiquesData, 'deliveries' | 'charges' | 'fuel' | 'maintenances'>): AnnualTotals {
  return {
    caTotal:          data.deliveries.reduce((s, d) => s + effectiveHtCts(d), 0),
    chargesTotal:     data.charges.reduce((s, d) => s + (d.montant_ht_cts ?? 0), 0),
    fuelTotal:        data.fuel.reduce((s, d) => s + (d.total_cts ?? 0), 0),
    maintenanceTotal: data.maintenances.reduce((s, d) => s + (d.cost_cts ?? 0), 0),
  }
}

// ── Top clients ──────────────────────────────────────────────────────────────────

/**
 * CA HT regroupé par client_id, trié décroissant, limité à `n` (défaut 5).
 * Le nom est pris sur la première livraison rencontrée ; absent → « — ».
 */
export function topClients(deliveries: StatDelivery[], n = 5): ClientCa[] {
  const clientMap: Record<string, ClientCa> = {}
  for (const d of deliveries) {
    const cid = d.client_id as string
    const cname = d.clients?.name ?? '—'
    if (!clientMap[cid]) clientMap[cid] = { name: cname, cts: 0 }
    clientMap[cid].cts += effectiveHtCts(d)
  }
  return Object.values(clientMap).sort((a, b) => b.cts - a.cts).slice(0, n)
}

// ── Charges par catégorie ─────────────────────────────────────────────────────────

/** CA HT des charges regroupé par catégorie (absente → « Autres »), trié décroissant : [[name, cts]]. */
export function chargesByCategory(charges: StatCharge[]): [string, number][] {
  const byCat: Record<string, number> = {}
  for (const d of charges) {
    const name = d.charge_categories?.name ?? 'Autres'
    byCat[name] = (byCat[name] ?? 0) + (d.montant_ht_cts ?? 0)
  }
  return Object.entries(byCat).sort((a, b) => b[1] - a[1])
}
