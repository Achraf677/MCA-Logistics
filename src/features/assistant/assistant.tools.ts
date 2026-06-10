// Outils de LECTURE de l'assistant — chaque outil RÉUTILISE la query/logique de
// l'onglet correspondant (mêmes définitions → chiffres identiques à l'affichage).
// Montants en EUROS. Listes plafonnées à 30. Cas vides gérés (jamais d'exception).
// Note d'archi : cette feature « assistant » importe volontairement les queries/logic
// d'autres features (consigne d'étape : réutiliser l'existant, ne pas dupliquer).

import { supabase } from '../../app/providers'
import { effectiveHtCts, centimesToEuros } from '../../shared/lib/money'

import { getAlertesDetectionData } from '../alertes/alertes.queries'
import { detectAlerts, summarizeAlerts } from '../alertes/alertes.logic'

import { getFacturedDeliveries, getClients } from '../clients/clients.queries'
import { computeEncours, CLIENT_TYPE_LABELS } from '../clients/clients.logic'
import type { DeliveryForEncours } from '../clients/clients.types'

import { getSuppliers } from '../fournisseurs/fournisseurs.queries'
import { getCategoryLabel } from '../fournisseurs/fournisseurs.logic'

import { getLatestSnapshot, getTransactions } from '../tresorerie/tresorerie.queries'

import { getCharges } from '../charges/charges.queries'
import { kpiSummary as chargesKpiSummary, CATEGORY_LABELS as CHARGE_CATEGORY_LABELS } from '../charges/charges.logic'

import { getTvaData } from '../tva/tva.queries'
import { computeTva } from '../tva/tva.logic'

const MAX_LIST = 30
const DAY_MS = 86_400_000

// ── Bornes d'un mois 'YYYY-MM' (défaut : mois courant) ────────────────────────

export function monthBounds(mois?: string): { label: string; start: string; end: string } {
  let y: number, m: number
  if (mois && /^\d{4}-\d{2}$/.test(mois)) {
    y = Number(mois.slice(0, 4))
    m = Number(mois.slice(5, 7)) - 1
  } else {
    const now = new Date()
    y = now.getFullYear()
    m = now.getMonth()
  }
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return {
    label: `${y}-${String(m + 1).padStart(2, '0')}`,
    start: iso(new Date(y, m, 1)),
    end: iso(new Date(y, m + 1, 0)),
  }
}

// ── 1) KPIs du mois ────────────────────────────────────────────────────────────
// Réutilise la définition du CA HT des onglets Statistiques/Rentabilité :
// deliveries.amount_ht_cts via effectiveHtCts, statut != 'annulee', filtre sur `date`.

export interface KpisMois {
  mois: string
  ca_ht_eur: number
  nb_livraisons: number
  nb_facturees: number
  nb_payees: number
}

export async function getKpisMois(mois?: string): Promise<KpisMois> {
  const { label, start, end } = monthBounds(mois)
  const { data, error } = await supabase
    .from('deliveries')
    .select('amount_ht_cts, statut')
    .gte('date', start)
    .lte('date', end)
    .neq('statut', 'annulee')
  if (error) throw new Error(error.message)
  const rows = data ?? []
  return {
    mois: label,
    ca_ht_eur: centimesToEuros(rows.reduce((s, d) => s + effectiveHtCts(d), 0)),
    nb_livraisons: rows.length,
    nb_facturees: rows.filter(d => d.statut === 'facturee').length,
    nb_payees: rows.filter(d => d.statut === 'payee').length,
  }
}

// ── 2) Alertes ────────────────────────────────────────────────────────────────
// Réutilise getAlertesDetectionData() + detectAlerts() + summarizeAlerts() (onglet Alertes).

export async function getAlertes() {
  const input = await getAlertesDetectionData()
  const alerts = detectAlerts(input)            // today/thresholds par défaut, comme l'écran
  const summary = summarizeAlerts(alerts)
  return {
    total: summary.total,
    par_severite: {
      critique: summary.parSeverite.critique,
      urgent: summary.parSeverite.urgent,
      warning: summary.parSeverite.warning,
      info: summary.parSeverite.info,
    },
    alertes: alerts.slice(0, MAX_LIST).map(a => ({
      severite: a.severity,
      categorie: a.category,
      titre: a.title,
      detail: a.detail,
      echeance: a.dueDate ?? null,
      jours_restants: a.daysLeft ?? null,
    })),
  }
}

// ── 3) Impayés ────────────────────────────────────────────────────────────────
// Réutilise getFacturedDeliveries() (statut 'facturee') + computeEncours() (onglet Clients).
// Retard = aujourd'hui − (invoiced_at + client.payment_terms).

export async function getImpayes() {
  const [{ data: facs }, { data: clients }] = await Promise.all([
    getFacturedDeliveries(),
    getClients(),
  ])
  const clientMap = new Map<string, { name: string; payment_terms: number }>()
  for (const c of clients ?? []) {
    clientMap.set(c.id, { name: c.name, payment_terms: c.payment_terms ?? 30 })
  }

  const facturees: DeliveryForEncours[] = (facs ?? []).map(f => ({
    id: f.id,
    statut: f.statut,
    amount_ttc_cts: f.amount_ttc_cts ?? null,
    montant_ttc_cts: f.montant_ttc_cts ?? null,
    invoiced_at: f.invoiced_at ?? null,
    payment_terms: clientMap.get((f as { client_id?: string }).client_id ?? '')?.payment_terms ?? 30,
  }))

  const enc = computeEncours(facturees)
  const today = new Date()

  const factures = (facs ?? [])
    .map(f => {
      const ttc = f.amount_ttc_cts ?? f.montant_ttc_cts ?? 0
      const pt = clientMap.get((f as { client_id?: string }).client_id ?? '')?.payment_terms ?? 30
      let jours_retard = 0
      if (f.invoiced_at) {
        const due = new Date(f.invoiced_at)
        due.setDate(due.getDate() + pt)
        jours_retard = Math.floor((today.getTime() - due.getTime()) / DAY_MS)
      }
      return {
        client: clientMap.get((f as { client_id?: string }).client_id ?? '')?.name ?? '—',
        montant_ttc_eur: centimesToEuros(ttc),
        date_facture: f.invoiced_at ? f.invoiced_at.slice(0, 10) : null,
        jours_retard,
      }
    })
    .sort((a, b) => b.jours_retard - a.jours_retard)
    .slice(0, MAX_LIST)

  return {
    total_impaye_eur: centimesToEuros(enc.total_cts),
    nb_factures: enc.count,
    factures,
  }
}

// ── 4) Trésorerie ─────────────────────────────────────────────────────────────
// Réutilise getLatestSnapshot() + getTransactions() (onglet Trésorerie).

export async function getTresorerie() {
  const [{ data: snap }, { data: txs }] = await Promise.all([
    getLatestSnapshot(),
    getTransactions(),
  ])
  return {
    solde_eur: snap ? centimesToEuros(snap.balance_cts) : 0,
    date_solde: snap?.fetched_at ?? null,
    dernieres_operations: (txs ?? []).slice(0, 15).map(t => ({
      date: t.settled_at ? t.settled_at.slice(0, 10) : null,
      libelle: t.label ?? '—',
      sens: t.side,
      montant_eur: centimesToEuros(Math.abs(t.amount_cts)),
    })),
  }
}

// ── 5) Charges du mois ────────────────────────────────────────────────────────
// Réutilise getCharges() + kpiSummary() (onglet Charges). TTC par catégorie selon la
// même convention que kpiSummary.totalTtc : montant_ttc_cts ?? montant_ht_cts.

export async function getChargesMois(mois?: string) {
  const { label, start, end } = monthBounds(mois)
  const { data } = await getCharges({ date_from: start, date_to: end })
  const rows = data ?? []
  const k = chargesKpiSummary(rows)

  const byCat: Record<string, number> = {}
  for (const r of rows) {
    const cat = r.category ?? 'autre'
    byCat[cat] = (byCat[cat] ?? 0) + (r.montant_ttc_cts ?? r.montant_ht_cts ?? 0)
  }

  return {
    mois: label,
    total_ht_eur: centimesToEuros(k.totalHtCts),
    total_ttc_eur: centimesToEuros(k.totalTtcCts),
    par_categorie: Object.entries(byCat).map(([cat, cts]) => ({
      categorie: CHARGE_CATEGORY_LABELS[cat as keyof typeof CHARGE_CATEGORY_LABELS] ?? cat,
      total_ttc_eur: centimesToEuros(cts),
    })),
  }
}

// ── 6) TVA ────────────────────────────────────────────────────────────────────
// Réutilise getTvaData() + computeTva() (onglet TVA), sur un mois.

export async function getTva(mois?: string) {
  const { label, start, end } = monthBounds(mois)
  const raw = await getTvaData(start, end)
  const t = computeTva(raw)
  return {
    mois: label,
    tva_collectee_eur: centimesToEuros(t.tvaCollecteeCts),
    tva_deductible_eur: centimesToEuros(t.tvaDeductibleCharges + t.tvaDeductibleCarburant),
    tva_nette_eur: centimesToEuros(t.soldeCts),
  }
}

// ── 7) Client par nom ─────────────────────────────────────────────────────────

interface ClientMatch {
  id: string
  name: string
  type: string | null
  city: string | null
  email: string | null
  phone: string | null
  payment_terms: number | null
}

export async function getClient(nom: string) {
  const q = (nom ?? '').trim().replace(/[(),]/g, '')
  if (!q) return { trouve: false }

  const { data, error } = await supabase
    .from('clients')
    .select('id, name, type, city, email, phone, payment_terms')
    .ilike('name', `%${q}%`)
    .order('name')
  if (error) throw new Error(error.message)

  const matches = (data ?? []) as ClientMatch[]
  if (matches.length === 0) return { trouve: false }
  if (matches.length > 1) return { trouve: true, ambigu: true, candidats: matches.map(m => m.name) }

  const c = matches[0]
  // CA HT (même définition que les onglets : effectiveHtCts, hors annulée) + impayé TTC.
  const { data: del } = await supabase
    .from('deliveries')
    .select('amount_ht_cts, amount_ttc_cts, statut, invoiced_at')
    .eq('client_id', c.id)
    .neq('statut', 'annulee')
  const deliveries = del ?? []

  const caCts = deliveries.reduce((s, d) => s + effectiveHtCts(d), 0)

  const forEncours: DeliveryForEncours[] = deliveries.map(d => ({
    id: '',
    statut: d.statut,
    amount_ttc_cts: d.amount_ttc_cts ?? null,
    montant_ttc_cts: null,
    invoiced_at: d.invoiced_at ?? null,
    payment_terms: c.payment_terms ?? 30,
  }))
  const enc = computeEncours(forEncours)

  return {
    trouve: true,
    client: {
      nom: c.name,
      type: c.type ? (CLIENT_TYPE_LABELS[c.type as keyof typeof CLIENT_TYPE_LABELS] ?? c.type) : null,
      ville: c.city ?? null,
      email: c.email ?? null,
      telephone: c.phone ?? null,
    },
    ca_total_eur: centimesToEuros(caCts),
    nb_livraisons: deliveries.length,
    impaye_eur: centimesToEuros(enc.total_cts),
  }
}

// ── 8) Listes clients / fournisseurs (actifs) ─────────────────────────────────

export async function getClientsList() {
  const { data } = await getClients({ active: true })
  const list = data ?? []
  return {
    total: list.length,
    clients: list.slice(0, MAX_LIST).map(c => ({
      nom: c.name,
      type: c.type ? (CLIENT_TYPE_LABELS[c.type as keyof typeof CLIENT_TYPE_LABELS] ?? c.type) : null,
      ville: c.city ?? null,
    })),
  }
}

export async function getFournisseursList() {
  const { data } = await getSuppliers({ active: true })
  const list = data ?? []
  return {
    total: list.length,
    fournisseurs: list.slice(0, MAX_LIST).map(s => ({
      nom: s.name,
      categorie: getCategoryLabel(s.category),
    })),
  }
}
