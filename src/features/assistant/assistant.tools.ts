// Outils de LECTURE de l'assistant — chaque outil RÉUTILISE la query/logique de
// l'onglet correspondant (mêmes définitions → chiffres identiques à l'affichage).
// Montants en EUROS. Listes plafonnées à 30. Cas vides gérés (jamais d'exception).
// Note d'archi : cette feature « assistant » importe volontairement les queries/logic
// d'autres features (consigne d'étape : réutiliser l'existant, ne pas dupliquer).

import { supabase } from '../../app/providers'
import { deliveryTotalTtcCts, effectiveHtCts, centimesToEuros } from '../../shared/lib/money'
import { normalizeClientName } from '../../shared/lib/normalizeClientName'
import { defaultPaymentTermCode } from '../../shared/lib/paymentTerms'
import type { PendingAction } from './AssistantContext'
// Queries LOCALES à l'assistant (étanchéité) pour la modification de client.
import { findClientsByName, updateClient, updateDelivery } from './assistant.queries'

import { getAlertesDetectionData } from '../alertes/alertes.queries'
import { detectAlerts, summarizeAlerts } from '../alertes/alertes.logic'

import { getFacturedDeliveries, getClients, createClient } from '../clients/clients.queries'
import { computeEncours, CLIENT_TYPE_LABELS } from '../clients/clients.logic'
import type { DeliveryForEncours, ClientInsert } from '../clients/clients.types'

import { getSuppliers, createSupplier } from '../fournisseurs/fournisseurs.queries'
import { getCategoryLabel } from '../fournisseurs/fournisseurs.logic'
import type { SupplierInsert } from '../fournisseurs/fournisseurs.types'

import { getLatestSnapshot, getTransactions } from '../tresorerie/tresorerie.queries'

import { getCharges, createCharge } from '../charges/charges.queries'
import { kpiSummary as chargesKpiSummary } from '../charges/charges.logic'
import type { ChargeInsert, ChargeRow } from '../charges/charges.types'

import { getTvaData } from '../tva/tva.queries'
import { computeTva } from '../tva/tva.logic'

// Vague B — opérations / flotte / équipe
import { getDeliveries, createDelivery, transitionDelivery } from '../livraisons/livraisons.queries'
import { STATUS_LABELS as DELIVERY_STATUS_LABELS, computeAmount, canTransition } from '../livraisons/livraisons.logic'
import type { DeliveryRow, DeliveryFilters, DeliveryInsert, DeliveryType, DeliveryStatus } from '../livraisons/livraisons.types'

import { fetchToursByDate, getActiveVehicles, getActiveDrivers, getDeliveriesForDate } from '../tournees/tournees.queries'
import type { Tour, TourDelivery } from '../tournees/tournees.types'

import { getIncidents, createIncident } from '../incidents/incidents.queries'
import { TYPE_LABELS as INCIDENT_TYPE_LABELS, STATUS_LABELS as INCIDENT_STATUS_LABELS } from '../incidents/incidents.logic'
import type { IncidentRow, IncidentFilters, IncidentInsert, IncidentType } from '../incidents/incidents.types'

import { getInspections } from '../inspections/inspections.queries'
import { TYPE_LABELS as INSPECTION_TYPE_LABELS, STATUS_LABELS as INSPECTION_STATUS_LABELS } from '../inspections/inspections.logic'
import type { InspectionRow, InspectionFilters } from '../inspections/inspections.types'

import { getVehicles, createVehicle } from '../vehicules/vehicules.queries'
import { STATUS_LABELS as VEHICLE_STATUS_LABELS, FUEL_LABELS } from '../vehicules/vehicules.logic'
import type { Vehicle, VehicleInsert } from '../vehicules/vehicules.types'

import { getFuelLogs, createFuelLog } from '../carburant/carburant.queries'
import { kpiSummary as fuelKpiSummary } from '../carburant/carburant.logic'
import type { FuelLogRow, FuelLogInsert } from '../carburant/carburant.types'

import { getMaintenances } from '../entretiens/entretiens.queries'
import { MAINTENANCE_TYPE_LABELS } from '../entretiens/entretiens.logic'
import type { MaintenanceRow } from '../entretiens/entretiens.types'

import { getTeamMembers } from '../equipe/equipe.queries'
import { getRoleLabel, getContractLabel } from '../equipe/equipe.logic'
import type { TeamMember } from '../equipe/equipe.types'

import { getWorkHours } from '../heures/heures.queries'
import type { WorkHourRow } from '../heures/heures.types'

// Rédaction (brouillons) — réutilise la query de l'onglet Brouillons IA
import { generateDraft } from '../brouillons/brouillons.queries'
import type { DraftType } from '../brouillons/brouillons.types'

// OCR / extraction feuille de route — réutilise la query de l'onglet Copilote IA
import { extractDeliveries } from '../copilote/copilote.queries'
import type { ExtractedDelivery, ExtractResponse } from '../copilote/copilote.types'

const MAX_LIST = 30
const DAY_MS = 86_400_000

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** companyId du profil authentifié (jamais codé en dur). null si indisponible. */
async function getCompanyId(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return null
  const { data } = await supabase.from('profiles').select('company_id').eq('id', uid).single()
  return (data as { company_id?: string } | null)?.company_id ?? null
}

function hoursOf(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10
}

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
  const rows = (data ?? []) as unknown as ChargeRow[]
  const k = chargesKpiSummary(rows)

  const byCat: Record<string, number> = {}
  for (const r of rows) {
    const cat = r.charge_categories?.name ?? 'Autres'
    byCat[cat] = (byCat[cat] ?? 0) + (r.montant_ttc_cts ?? r.montant_ht_cts ?? 0)
  }

  return {
    mois: label,
    total_ht_eur: centimesToEuros(k.totalHtCts),
    total_ttc_eur: centimesToEuros(k.totalTtcCts),
    par_categorie: Object.entries(byCat).map(([cat, cts]) => ({
      categorie: cat,
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
    tva_deductible_eur: centimesToEuros(t.tvaDeductibleChargesFR + t.tvaDeductibleCarburantFR),
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

// ═══════════════════════ VAGUE B — OPÉRATIONS / FLOTTE / ÉQUIPE ═══════════════

// ── 1) Livraisons ──────────────────────────────────────────────────────────────
// Réutilise getDeliveries() (onglet Livraisons). Montant HT via effectiveHtCts.
// Pas de champ « ville » structuré → on remonte delivery_address.

export async function getLivraisons(date?: string, statut?: string) {
  const filters: DeliveryFilters = {}
  if (date) { filters.date_from = date; filters.date_to = date }
  if (statut) filters.status = statut as DeliveryFilters['status']
  const { data } = await getDeliveries(filters)
  const rows = (data ?? []) as unknown as DeliveryRow[]
  return {
    total: rows.length,
    livraisons: rows.slice(0, MAX_LIST).map(d => ({
      client: d.clients?.name ?? '—',
      date: d.date,
      statut: DELIVERY_STATUS_LABELS[d.statut] ?? d.statut,
      montant_ht_eur: centimesToEuros(effectiveHtCts(d)),
      ville: d.delivery_address ?? null,
    })),
  }
}

// ── 2) Tournées du jour ────────────────────────────────────────────────────────
// Réutilise fetchToursByDate() + getActiveVehicles/Drivers + getDeliveriesForDate (onglet Tournées).

const TOUR_STATUS_LABELS: Record<string, string> = {
  brouillon: 'Brouillon', optimisee: 'Optimisée', en_cours: 'En cours', terminee: 'Terminée',
}

export async function getTournees(date?: string) {
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO()
  const companyId = await getCompanyId()
  if (!companyId) return { date: day, total: 0, tournees: [] }

  const [toursRes, vehRes, drvRes, delRes] = await Promise.all([
    fetchToursByDate(companyId, day),
    getActiveVehicles(),
    getActiveDrivers(),
    getDeliveriesForDate(companyId, day),
  ])
  const vMap = new Map((vehRes.data ?? []).map(v => [v.id, v.label]))
  const dMap = new Map((drvRes.data ?? []).map(d => [d.id, d.full_name]))

  const stopCount = new Map<string, number>()
  for (const d of (delRes.data ?? []) as unknown as TourDelivery[]) {
    if (d.tour_id) stopCount.set(d.tour_id, (stopCount.get(d.tour_id) ?? 0) + 1)
  }

  const tours = (toursRes.data ?? []) as Tour[]
  return {
    date: day,
    total: tours.length,
    tournees: tours.slice(0, MAX_LIST).map(t => ({
      vehicule: t.vehicle_id ? (vMap.get(t.vehicle_id) ?? '—') : '—',
      chauffeur: t.driver_id ? (dMap.get(t.driver_id) ?? '—') : '—',
      nb_arrets: stopCount.get(t.id) ?? 0,
      km: t.total_km != null ? Number(t.total_km) : null,
      statut: TOUR_STATUS_LABELS[t.status] ?? t.status,
    })),
  }
}

// ── 3) Incidents ───────────────────────────────────────────────────────────────
// Réutilise getIncidents() (onglet Incidents). Défaut : non clos (ouvert + en_cours).

export async function getIncidentsList(statut?: string) {
  const filters: IncidentFilters = {}
  if (statut) filters.status = statut as IncidentFilters['status']
  const { data } = await getIncidents(filters)
  let rows = (data ?? []) as unknown as IncidentRow[]
  if (!statut) rows = rows.filter(r => r.status !== 'clos')
  return {
    total: rows.length,
    incidents: rows.slice(0, MAX_LIST).map(r => ({
      date: r.date,
      type: r.type ? (INCIDENT_TYPE_LABELS[r.type] ?? r.type) : null,
      vehicule: r.vehicles?.label ?? '—',
      statut: INCIDENT_STATUS_LABELS[r.status] ?? r.status,
      description: r.description ?? null,
    })),
  }
}

// ── 4) Inspections ─────────────────────────────────────────────────────────────
// Réutilise getInspections() (onglet Inspections). Champ défauts = `defects`.

export async function getInspectionsList(statut?: string) {
  const filters: InspectionFilters = {}
  if (statut) filters.status = statut as InspectionFilters['status']
  const { data } = await getInspections(filters)
  const rows = (data ?? []) as unknown as InspectionRow[]
  return {
    total: rows.length,
    inspections: rows.slice(0, MAX_LIST).map(r => ({
      date: r.date,
      vehicule: r.vehicles?.label ?? '—',
      type: r.type ? (INSPECTION_TYPE_LABELS[r.type] ?? r.type) : null,
      statut: INSPECTION_STATUS_LABELS[r.status] ?? r.status,
      defauts: r.defects ?? null,
    })),
  }
}

// ── 5) Véhicules ───────────────────────────────────────────────────────────────
// Réutilise getVehicles() (onglet Véhicules).

export async function getVehicules() {
  const { data } = await getVehicles()
  const rows = (data ?? []) as unknown as Vehicle[]
  return {
    total: rows.length,
    vehicules: rows.slice(0, MAX_LIST).map(v => ({
      label: v.label,
      plaque: v.plate,
      statut: VEHICLE_STATUS_LABELS[v.status] ?? v.status,
      ct_expiry: v.ct_expiry ?? null,
      insurance_expiry: v.insurance_expiry ?? null,
      next_revision_date: v.next_revision_date ?? null,
    })),
  }
}

// ── 6) Carburant du mois ───────────────────────────────────────────────────────
// Réutilise getFuelLogs() + kpiSummary() (onglet Carburant).

export async function getCarburantMois(mois?: string) {
  const { label, start, end } = monthBounds(mois)
  const { data } = await getFuelLogs({ date_from: start, date_to: end })
  const rows = (data ?? []) as unknown as FuelLogRow[]
  const k = fuelKpiSummary(rows)
  return {
    mois: label,
    total_eur: centimesToEuros(k.totalCts),
    nb_pleins: k.nb,
    total_litres: k.totalLiters,
  }
}

// ── 7) Entretiens à venir ──────────────────────────────────────────────────────
// Réutilise getMaintenances() (onglet Entretiens) ; filtre next_due_date >= aujourd'hui, tri asc.

export async function getEntretiens() {
  const { data } = await getMaintenances()
  const rows = (data ?? []) as unknown as MaintenanceRow[]
  const today = todayISO()
  const upcoming = rows
    .filter(r => r.next_due_date != null && r.next_due_date >= today)
    .sort((a, b) => (a.next_due_date! < b.next_due_date! ? -1 : a.next_due_date! > b.next_due_date! ? 1 : 0))
  return {
    total: upcoming.length,
    prochains: upcoming.slice(0, MAX_LIST).map(r => ({
      vehicule: r.vehicles?.label ?? '—',
      type: r.type ? (MAINTENANCE_TYPE_LABELS[r.type] ?? r.type) : null,
      next_due_date: r.next_due_date,
      next_due_km: r.next_due_km ?? null,
    })),
  }
}

// ── 8) Équipe ──────────────────────────────────────────────────────────────────
// Réutilise getTeamMembers() + getRoleLabel/getContractLabel (onglet Équipe).

export async function getEquipe() {
  const { data } = await getTeamMembers({ active: true })
  const rows = (data ?? []) as TeamMember[]
  return {
    total: rows.length,
    membres: rows.slice(0, MAX_LIST).map(m => ({
      nom: m.full_name,
      role: m.role ? getRoleLabel(m.role) : (m.role_label ?? '—'),
      contrat: getContractLabel(m.contract_type),
      licence_b_expiry: m.licence_b_expiry ?? null,
      medical_visit_expiry: m.medical_visit_expiry ?? null,
      fin_contrat: m.end_date ?? null,
    })),
  }
}

// ── 9) Heures du mois ──────────────────────────────────────────────────────────
// Réutilise getWorkHours() (onglet Heures) ; total_minutes calculé en base.

export async function getHeures(membre?: string, mois?: string) {
  const { label, start, end } = monthBounds(mois)
  const { data } = await getWorkHours({ date_from: start, date_to: end })
  let rows = (data ?? []) as unknown as WorkHourRow[]
  if (membre && membre.trim()) {
    const q = membre.trim().toLowerCase()
    rows = rows.filter(r => (r.team_members?.full_name ?? '').toLowerCase().includes(q))
  }
  const totalMin = rows.reduce((s, r) => s + (r.total_minutes ?? 0), 0)
  const byMember = new Map<string, number>()
  for (const r of rows) {
    const name = r.team_members?.full_name ?? '—'
    byMember.set(name, (byMember.get(name) ?? 0) + (r.total_minutes ?? 0))
  }
  return {
    mois: label,
    total_heures: hoursOf(totalMin),
    par_membre: [...byMember.entries()].slice(0, MAX_LIST).map(([m, min]) => ({ membre: m, heures: hoursOf(min) })),
  }
}

// ═══════════════════════ ÉCRITURE — create_livraison (avec confirmation) ══════
// Préparation (résolution client + validation + payload) ; l'EXÉCUTION n'a lieu
// qu'après confirmation explicite côté UI. Réutilise createDelivery() et la même
// forme de payload que le drawer « Nouvelle livraison » (DrawerLivraison.handleSave).

export interface CreateLivraisonArgs {
  client?: string
  date?: string
  montant_ht_eur?: number
  type?: string
  adresse?: string
  ville?: string
}

export type PrepareResult =
  | { ok: false; message: string }
  | { ok: true; action: PendingAction }

const DELIVERY_TYPES = ['medical', 'ecommerce', 'retail', 'particulier']

/** Résout un client unique par nom (ilike, actifs). */
async function resolveClient(rawName: string): Promise<
  | { ok: false; message: string }
  | { ok: true; client: { id: string; name: string } }
> {
  const nom = rawName.trim().replace(/[(),]/g, '')
  if (!nom) return { ok: false, message: 'Précise le nom du client.' }
  const { data, error } = await supabase
    .from('clients').select('id, name').ilike('name', `%${nom}%`).eq('active', true).order('name')
  if (error) return { ok: false, message: error.message }
  const matches = (data ?? []) as { id: string; name: string }[]
  if (matches.length === 0) return { ok: false, message: `Client introuvable : ${nom}.` }
  if (matches.length > 1) {
    return { ok: false, message: `Plusieurs clients correspondent : ${matches.map(m => m.name).join(', ')}. Lequel ?` }
  }
  return { ok: true, client: matches[0] }
}

export async function prepareCreateLivraison(args: CreateLivraisonArgs): Promise<PrepareResult> {
  const r = await resolveClient(args.client ?? '')
  if (!r.ok) return r
  const client = r.client

  // Validation de la date.
  const date = (args.date ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime())) {
    return { ok: false, message: 'Date invalide : indique une date au format AAAA-MM-JJ.' }
  }

  const companyId = await getCompanyId()
  if (!companyId) return { ok: false, message: 'Profil non chargé : impossible de créer la livraison.' }

  const type = args.type && DELIVERY_TYPES.includes(args.type) ? (args.type as DeliveryType) : null
  const amount_ht_cts =
    typeof args.montant_ht_eur === 'number' && args.montant_ht_eur > 0
      ? Math.round(args.montant_ht_eur * 100)
      : null

  // Montants v2 calculés EXACTEMENT comme DrawerLivraison.handleSave : via computeAmount
  // en mode manuel (TVA auto 20 % par différence — ttc = round(ht×1,2), tva = ttc − ht).
  const computed = amount_ht_cts != null
    ? computeAmount({ tariff_mode: 'manuel', tariff_rate_cts: null }, { manual_ht_cts: amount_ht_cts })
    : null

  const adresse = args.adresse?.trim() || null
  const ville = args.ville?.trim() || null
  const delivery_address = [adresse, ville].filter(Boolean).join(', ') || null
  const montantHt = amount_ht_cts != null ? amount_ht_cts / 100 : null

  // Même forme que DrawerLivraison.handleSave (création) — seules les colonnes v2 sont écrites.
  const payload: DeliveryInsert = {
    company_id: companyId,
    client_id: client.id,
    date,
    statut: 'planifiee',
    vehicle_id: null,
    driver_id: null,
    type,
    description: null,
    pickup_address: null,
    delivery_address,
    delivery_lat: null,
    delivery_lng: null,
    km: null,
    empty_km: null,
    weight_kg: null,
    amount_ht_cts:  computed?.amount_ht_cts  ?? null,
    tva_cts:        computed?.tva_cts         ?? null,
    amount_ttc_cts: computed?.amount_ttc_cts ?? null,
    invoiced_at: null,
    paid_at: null,
    notes: null,
  }

  return {
    ok: true,
    action: {
      title: 'Créer une livraison',
      lines: [
        { label: 'Client', value: client.name },
        { label: 'Date', value: date },
        { label: 'Montant HT', value: montantHt != null ? `${montantHt} €` : '—' },
        { label: 'Type', value: type ?? '—' },
        { label: 'Adresse', value: delivery_address ?? '—' },
      ],
      confirmLabel: 'Confirmer',
      run: async () => {
        const { error } = await createDelivery(payload)
        if (error) return `❌ La création a échoué : ${error.message}.`
        const m = montantHt != null ? `${montantHt} € HT` : 'montant non précisé'
        return `✅ Livraison créée : ${client.name}, ${date}, ${m}.`
      },
    },
  }
}

// ── Action : changer le statut d'une livraison (cycle de vie) ─────────────────
// Réutilise la machine d'états (canTransition) et transitionDelivery() de l'onglet
// Livraisons — mêmes effets de bord (invoiced_at à la facturation, paid_at à
// l'encaissement, push Pennylane à →facturee). Aucune logique réimplémentée.

export interface ChangerStatutArgs {
  client?: string
  date?: string
  action?: string
}

const ACTION_TO_STATUS: Record<string, DeliveryStatus> = {
  demarrer: 'en_cours',
  livrer: 'livree',
  facturer: 'facturee',
  encaisser: 'payee',
  annuler: 'annulee',
}
const ACTION_VERB: Record<string, string> = {
  demarrer: 'démarrer', livrer: 'livrer', facturer: 'facturer', encaisser: 'encaisser', annuler: 'annuler',
}

const statutLabel = (s: string) => DELIVERY_STATUS_LABELS[s] ?? s

export async function prepareChangerStatutLivraison(args: ChangerStatutArgs): Promise<PrepareResult> {
  const action = (args.action ?? '').trim()
  const to = ACTION_TO_STATUS[action]
  if (!to) return { ok: false, message: `Action inconnue : « ${action} ».` }

  const r = await resolveClient(args.client ?? '')
  if (!r.ok) return r
  const client = r.client

  const date = (args.date ?? '').trim()
  const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const suffixe = hasDate ? ` le ${date}` : ''

  const filters: DeliveryFilters = { client_id: client.id }
  if (hasDate) { filters.date_from = date; filters.date_to = date }
  const { data } = await getDeliveries(filters)
  const dels = (data ?? []) as unknown as DeliveryRow[]

  if (dels.length === 0) return { ok: false, message: `Aucune livraison trouvée pour ${client.name}${suffixe}.` }
  if (dels.length > 1) {
    const liste = dels.slice(0, 5).map(d => {
      const ttc = centimesToEuros(deliveryTotalTtcCts(d))
      return `${d.date} · ${ttc} € · ${statutLabel(d.statut)}`
    }).join(' ; ')
    return { ok: false, message: `Plusieurs livraisons correspondent : ${liste}. Précise la date.` }
  }

  const d = dels[0]

  // Légalité de la transition (même règle que l'onglet Suivi).
  if (!canTransition(d.statut, to)) {
    return { ok: false, message: `La livraison est ${statutLabel(d.statut)} : impossible de ${ACTION_VERB[action]}.` }
  }
  if (to === 'facturee' && (d.amount_ht_cts ?? 0) <= 0) {
    return { ok: false, message: 'Montant requis avant de facturer : renseigne d’abord le montant de la livraison.' }
  }

  // Mêmes effets de bord que handleTransition : à →facturee on passe le montant.
  const amountForTransition = to === 'facturee'
    ? { amount_ht_cts: d.amount_ht_cts ?? 0, tva_cts: d.tva_cts ?? 0, amount_ttc_cts: d.amount_ttc_cts ?? 0 }
    : undefined
  const ttc = centimesToEuros(deliveryTotalTtcCts(d))

  return {
    ok: true,
    action: {
      title: 'Changer le statut',
      lines: [
        { label: 'Client', value: client.name },
        { label: 'Date', value: d.date },
        { label: 'Montant', value: ttc > 0 ? `${ttc} € TTC` : '—' },
        { label: 'Statut', value: `${statutLabel(d.statut)} → ${statutLabel(to)}` },
      ],
      confirmLabel: 'Confirmer',
      run: async () => {
        const { error } = await transitionDelivery(d.id, d.statut, to, amountForTransition)
        if (error) return `❌ ${client.name} ${d.date} : ${error.message}.`
        return `✅ ${client.name} ${d.date} : ${statutLabel(d.statut)} → ${statutLabel(to)}.`
      },
    },
  }
}

// ═══════════════════════ ÉCRITURE — créations (avec confirmation) ═════════════
// Chaque prepareXxx reproduit le payload du drawer de l'onglet correspondant
// (mêmes champs obligatoires, défauts et calculs ; colonnes générées non écrites).

const isoDateValid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(new Date(d).getTime())

/** Résout un véhicule unique par plaque OU label (ilike). activeOnly comme le drawer Carburant. */
async function resolveVehicule(raw: string, activeOnly: boolean): Promise<
  | { ok: false; message: string }
  | { ok: true; vehicle: { id: string; label: string; plate: string } }
> {
  const q = (raw ?? '').trim().replace(/[(),]/g, '')
  if (!q) return { ok: false, message: 'Précise le véhicule (plaque ou nom).' }
  let req = supabase.from('vehicles').select('id, label, plate').or(`label.ilike.%${q}%,plate.ilike.%${q}%`).order('label')
  if (activeOnly) req = req.eq('status', 'active')
  const { data, error } = await req
  if (error) return { ok: false, message: error.message }
  const matches = (data ?? []) as { id: string; label: string; plate: string }[]
  if (matches.length === 0) {
    // Dépendance manquante : on PROPOSE de créer le véhicule (message normal,
    // gardé dans l'historique → l'assistant pourra enchaîner sur create_vehicule).
    return { ok: false, message: `Le véhicule « ${q} » n'existe pas encore. Veux-tu que je l'ajoute à la flotte ? Donne-moi la plaque (et éventuellement marque/modèle).` }
  }
  if (matches.length > 1) {
    return { ok: false, message: `Plusieurs véhicules correspondent : ${matches.map(v => `${v.label} (${v.plate})`).join(', ')}. Précise la plaque.` }
  }
  return { ok: true, vehicle: matches[0] }
}

// ── a) create_charge ──────────────────────────────────────────────────────────
// Réutilise createCharge() + computeTtcCts (onglet Charges). Le drawer part du HT ;
// ici on part du TTC → HT = round(ttc/(1+taux/100)), tva = ttc − ht (taux défaut 20).

export interface CreateChargeArgs {
  libelle?: string
  montant_ttc_eur?: number
  categorie?: string
  date?: string
  fournisseur?: string
}

export async function prepareCreateCharge(args: CreateChargeArgs): Promise<PrepareResult> {
  const libelle = (args.libelle ?? '').trim()
  if (!libelle) return { ok: false, message: 'Précise le libellé de la charge.' }
  const date = (args.date ?? '').trim()
  if (!isoDateValid(date)) return { ok: false, message: 'Date invalide : indique une date au format AAAA-MM-JJ.' }
  if (typeof args.montant_ttc_eur !== 'number' || args.montant_ttc_eur <= 0) {
    return { ok: false, message: 'Montant TTC invalide : indique un montant en euros (> 0).' }
  }
  const companyId = await getCompanyId()
  if (!companyId) return { ok: false, message: 'Profil non chargé : impossible de créer la charge.' }

  // Les catégories sont désormais en DB (charge_categories). L'assistant ne peut pas
  // résoudre un UUID ici sans requête supplémentaire — on crée la charge sans catégorie.
  const _categorie = args.categorie  // conservé pour affichage dans la confirmation

  // Fournisseur optionnel : résolu par nom (1 seul match actif). Introuvable →
  // on crée QUAND MÊME la charge (supplier_id null) et on le signale.
  let supplier_id: string | null = null
  let fournisseurNote = ''
  const fourn = (args.fournisseur ?? '').trim().replace(/[(),]/g, '')
  if (fourn) {
    const { data } = await supabase.from('suppliers').select('id, name').ilike('name', `%${fourn}%`).eq('active', true)
    const sup = (data ?? []) as { id: string; name: string }[]
    if (sup.length === 1) supplier_id = sup[0].id
    else if (sup.length === 0) fournisseurNote = ` Fournisseur « ${fourn} » non trouvé : veux-tu que je le crée et le lie ?`
    else fournisseurNote = ` Plusieurs fournisseurs « ${fourn} » : non lié, précise.`
  }

  const tvaRate = 20
  const ttcCts = Math.round(args.montant_ttc_eur * 100)
  const htCts = Math.round(ttcCts / (1 + tvaRate / 100))
  const tvaCts = ttcCts - htCts

  // Objet construit avec UNIQUEMENT des colonnes réelles de `charges`.
  const payload: ChargeInsert = {
    company_id: companyId,
    date,
    label: libelle,
    category_id: null,
    supplier_id,
    montant_ht_cts: htCts,
    tva_rate: tvaRate,
    tva_cts: tvaCts,
    montant_ttc_cts: ttcCts,
    receipt_url: null,
    notes: null,
  }

  return {
    ok: true,
    action: {
      title: 'Créer une charge',
      lines: [
        { label: 'Libellé', value: libelle },
        { label: 'Catégorie', value: _categorie ?? 'non catégorisé' },
        { label: 'Montant TTC', value: `${centimesToEuros(ttcCts)} €` },
        { label: 'Date', value: date },
        ...(fourn ? [{ label: 'Fournisseur', value: supplier_id ? fourn : `${fourn} (non lié)` }] : []),
      ],
      confirmLabel: 'Confirmer',
      run: async () => {
        const { error } = await createCharge(payload)
        if (error) return `❌ La création a échoué : ${(error as Error).message}.`
        return `✅ Charge créée : ${libelle}, ${centimesToEuros(ttcCts)} € TTC, ${date}.${fournisseurNote}`
      },
    },
  }
}

// ── b) create_client ──────────────────────────────────────────────────────────
// Réutilise createClient() + défauts d'EMPTY_FORM (onglet Clients).

export interface CreateClientArgs {
  nom?: string
  type?: string
  ville?: string
  email?: string
  telephone?: string
  delai_paiement_jours?: number
}

const CLIENT_TYPES = ['medical', 'ecommerce', 'retail', 'particulier', 'professionnel']

export async function prepareCreateClient(args: CreateClientArgs): Promise<PrepareResult> {
  const nom = (args.nom ?? '').trim()
  if (!nom) return { ok: false, message: 'Précise le nom du client.' }
  const companyId = await getCompanyId()
  if (!companyId) return { ok: false, message: 'Profil non chargé : impossible de créer le client.' }

  const type = (args.type && CLIENT_TYPES.includes(args.type) ? args.type : null) as ClientInsert['type']
  const payment_terms = typeof args.delai_paiement_jours === 'number' && args.delai_paiement_jours > 0
    ? Math.round(args.delai_paiement_jours) : 30

  // Colonnes réelles uniquement (vérité terrain). Champs optionnels non fournis = null
  // (et non ''), pour un insert propre. Mapping confirmé : ville→city, telephone→phone.
  const payload: ClientInsert = {
    company_id: companyId,
    name: normalizeClientName(nom),
    siret: null,
    tva_intra: null,
    address: null,
    city: args.ville?.trim() || null,
    postal_code: null,
    email: args.email?.trim() || null,
    phone: args.telephone?.trim() || null,
    type,
    payment_terms,
    payment_terms_label: defaultPaymentTermCode(payment_terms),
    notes: null,
    active: true,
    tariff_mode: 'manuel',
    tariff_rate_cts: null,
  }

  return {
    ok: true,
    action: {
      title: 'Créer un client',
      lines: [
        { label: 'Nom', value: nom },
        { label: 'Type', value: type ? (CLIENT_TYPE_LABELS[type] ?? type) : '—' },
        { label: 'Ville', value: payload.city || '—' },
        { label: 'Email', value: payload.email || '—' },
        { label: 'Téléphone', value: payload.phone || '—' },
        { label: 'Délai paiement', value: `${payment_terms} j` },
      ],
      confirmLabel: 'Confirmer',
      run: async () => {
        const { error } = await createClient(payload)
        if (error) return `❌ La création a échoué : ${(error as Error).message}.`
        return `✅ Client créé : ${nom}.`
      },
    },
  }
}

// ── b bis) modifier_client ─────────────────────────────────────────────────────
// Patron des outils modifier_* : résout le client par nom (findClientsByName,
// query LOCALE à l'assistant), construit un PATCH partiel (uniquement les champs
// fournis) et présente une carte AVANT→APRÈS. Exécution via updateClient au clic.

export interface ModifierClientArgs {
  nom?: string
  nouveau_nom?: string
  ville?: string
  adresse?: string
  email?: string
  telephone?: string
  delai_paiement_jours?: number
  type?: string
}

export async function prepareModifierClient(args: ModifierClientArgs): Promise<PrepareResult> {
  const nom = (args.nom ?? '').trim()
  if (!nom) return { ok: false, message: 'Précise le nom du client à modifier.' }

  const matches = await findClientsByName(nom)
  if (matches.length === 0) return { ok: false, message: `Aucun client « ${nom} » trouvé.` }
  if (matches.length > 1) {
    return { ok: false, message: `Plusieurs clients correspondent : ${matches.map(m => m.name).join(', ')}. Lequel veux-tu modifier ?` }
  }
  const c = matches[0]

  // PATCH partiel : UNIQUEMENT les champs fournis. Mapping ville→city, adresse→address,
  // telephone→phone, nouveau_nom→name, delai_paiement_jours→payment_terms. Type validé.
  const patch: Record<string, unknown> = {}
  const lines: { label: string; value: string }[] = []
  const change = (label: string, ancien: string | null, nouveau: string) =>
    lines.push({ label, value: `${ancien || '—'} → ${nouveau}` })

  const nouveauNom = args.nouveau_nom?.trim()
  if (nouveauNom) { patch.name = nouveauNom; change('Nom', c.name, nouveauNom) }

  const ville = args.ville?.trim()
  if (ville) { patch.city = ville; change('Ville', c.city, ville) }

  const adresse = args.adresse?.trim()
  if (adresse) { patch.address = adresse; change('Adresse', c.address, adresse) }

  const email = args.email?.trim()
  if (email) { patch.email = email; change('Email', c.email, email) }

  const telephone = args.telephone?.trim()
  if (telephone) { patch.phone = telephone; change('Téléphone', c.phone, telephone) }

  if (typeof args.delai_paiement_jours === 'number' && args.delai_paiement_jours > 0) {
    const nv = Math.round(args.delai_paiement_jours)
    patch.payment_terms = nv
    change('Délai paiement', c.payment_terms != null ? `${c.payment_terms} j` : null, `${nv} j`)
  }

  if (args.type && CLIENT_TYPES.includes(args.type)) {
    patch.type = args.type
    const ancienType = c.type ? (CLIENT_TYPE_LABELS[c.type as keyof typeof CLIENT_TYPE_LABELS] ?? c.type) : null
    const nouveauType = CLIENT_TYPE_LABELS[args.type as keyof typeof CLIENT_TYPE_LABELS] ?? args.type
    change('Type', ancienType, nouveauType)
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, message: 'Rien à modifier : précise au moins un champ (nom, ville, adresse, email, téléphone, type, délai de paiement).' }
  }

  return {
    ok: true,
    action: {
      title: `Modifier le client ${c.name}`,
      lines,
      confirmLabel: 'Confirmer',
      run: async () => {
        const { error } = await updateClient(c.id, patch)
        if (error) return `❌ La modification a échoué : ${(error as Error).message}.`
        return `✅ Client ${c.name} mis à jour.`
      },
    },
  }
}

// ── b ter) modifier_livraison ─────────────────────────────────────────────────
// Patron modifier_* : résout le client, identifie la livraison (date optionnelle),
// vérifie le verrou facturée/payée, construit un patch partiel AVANT→APRÈS,
// exécute updateDelivery (query LOCALE à l'assistant). Colonnes générées jamais écrites.

export interface ModifierLivraisonArgs {
  client?: string
  date?: string
  nouvelle_date?: string
  montant_ht_eur?: number
  type?: string
  description?: string
  adresse_livraison?: string
  adresse_retrait?: string
  poids_kg?: number
  km?: number
  km_vide?: number
}

export async function prepareModifierLivraison(args: ModifierLivraisonArgs): Promise<PrepareResult> {
  const r = await resolveClient(args.client ?? '')
  if (!r.ok) return r
  const client = r.client

  const date = (args.date ?? '').trim()
  const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const suffixe = hasDate ? ` le ${date}` : ''

  const filters: DeliveryFilters = { client_id: client.id }
  if (hasDate) { filters.date_from = date; filters.date_to = date }
  const { data } = await getDeliveries(filters)
  const dels = (data ?? []) as unknown as DeliveryRow[]

  if (dels.length === 0) {
    return { ok: false, message: `Aucune livraison trouvée pour ${client.name}${suffixe}.` }
  }
  if (dels.length > 1) {
    const liste = dels.slice(0, 5).map(d => {
      const ttc = centimesToEuros(deliveryTotalTtcCts(d))
      return `${d.date} · ${ttc} € · ${statutLabel(d.statut)}`
    }).join(' ; ')
    return { ok: false, message: `Plusieurs livraisons correspondent : ${liste}. Précise la date.` }
  }
  const d = dels[0]

  if (d.statut === 'facturee' || d.statut === 'payee') {
    return { ok: false, message: `Livraison déjà ${statutLabel(d.statut)} : modification impossible (passe par un avoir ou l'onglet).` }
  }

  const patch: Record<string, unknown> = {}
  const lines: { label: string; value: string }[] = []
  const change = (label: string, ancien: string | null, nouveau: string) =>
    lines.push({ label, value: `${ancien || '—'} → ${nouveau}` })

  const nouvelleDate = args.nouvelle_date?.trim()
  if (nouvelleDate && /^\d{4}-\d{2}-\d{2}$/.test(nouvelleDate)) {
    patch.date = nouvelleDate
    change('Date', d.date, nouvelleDate)
  }

  if (typeof args.montant_ht_eur === 'number' && args.montant_ht_eur > 0) {
    const htCts = Math.round(args.montant_ht_eur * 100)
    const computed = computeAmount(
      { tariff_mode: 'manuel', tariff_rate_cts: null },
      { manual_ht_cts: htCts },
    )
    if (computed) {
      patch.amount_ht_cts  = computed.amount_ht_cts
      patch.tva_cts        = computed.tva_cts
      patch.amount_ttc_cts = computed.amount_ttc_cts
      const ancienHt = d.amount_ht_cts != null ? `${centimesToEuros(d.amount_ht_cts)} €` : null
      change('Montant HT', ancienHt, `${args.montant_ht_eur} €`)
    }
  }

  if (args.type && DELIVERY_TYPES.includes(args.type)) {
    patch.type = args.type as DeliveryType
    change('Type', (d as unknown as { type: string | null }).type ?? null, args.type)
  }

  const desc = args.description?.trim()
  if (desc) {
    patch.description = desc
    change('Description', (d as unknown as { description: string | null }).description ?? null, desc)
  }

  const addrLiv = args.adresse_livraison?.trim()
  if (addrLiv) {
    patch.delivery_address = addrLiv
    change('Adresse livraison', d.delivery_address ?? null, addrLiv)
  }

  const addrRet = args.adresse_retrait?.trim()
  if (addrRet) {
    patch.pickup_address = addrRet
    change('Adresse retrait', (d as unknown as { pickup_address: string | null }).pickup_address ?? null, addrRet)
  }

  if (typeof args.poids_kg === 'number') {
    patch.weight_kg = args.poids_kg
    const dw = (d as unknown as { weight_kg: number | null }).weight_kg
    change('Poids', dw != null ? `${dw} kg` : null, `${args.poids_kg} kg`)
  }

  if (typeof args.km === 'number') {
    patch.km = args.km
    const dk = (d as unknown as { km: number | null }).km
    change('km en charge', dk != null ? `${dk} km` : null, `${args.km} km`)
  }

  if (typeof args.km_vide === 'number') {
    patch.empty_km = args.km_vide
    const de = (d as unknown as { empty_km: number | null }).empty_km
    change('km à vide', de != null ? `${de} km` : null, `${args.km_vide} km`)
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, message: 'Rien à modifier : précise au moins un champ.' }
  }

  return {
    ok: true,
    action: {
      title: `Modifier la livraison ${client.name} ${d.date}`,
      lines,
      confirmLabel: 'Confirmer',
      run: async () => {
        const { error } = await updateDelivery(d.id, patch)
        if (error) return `❌ La modification a échoué : ${(error as Error).message}.`
        return `✅ Livraison ${client.name} ${d.date} mise à jour.`
      },
    },
  }
}

// ── c) create_plein ───────────────────────────────────────────────────────────
// Réutilise createFuelLog() (onglet Carburant). tva_cts NON écrit (généré en base).
// price_per_liter_milli dérivé = round(total_cts * 10 / litres), comme le drawer.

export interface CreatePleinArgs {
  vehicule?: string
  montant_ttc_eur?: number
  litres?: number
  date?: string
}

export async function prepareCreatePlein(args: CreatePleinArgs): Promise<PrepareResult> {
  const date = (args.date ?? '').trim()
  if (!isoDateValid(date)) return { ok: false, message: 'Date invalide : indique une date au format AAAA-MM-JJ.' }
  if (typeof args.litres !== 'number' || args.litres <= 0) {
    return { ok: false, message: 'Litres invalides : indique un nombre de litres (> 0).' }
  }
  if (typeof args.montant_ttc_eur !== 'number' || args.montant_ttc_eur <= 0) {
    return { ok: false, message: 'Montant TTC invalide : indique un montant en euros (> 0).' }
  }
  const v = await resolveVehicule(args.vehicule ?? '', true)
  if (!v.ok) return v
  const companyId = await getCompanyId()
  if (!companyId) return { ok: false, message: 'Profil non chargé : impossible de créer le plein.' }

  const totalCts = Math.round(args.montant_ttc_eur * 100)
  const pricePerLiterMilli = Math.round(totalCts * 10 / args.litres)

  const payload: FuelLogInsert = {
    company_id: companyId,
    vehicle_id: v.vehicle.id,
    driver_id: null,
    date,
    liters: args.litres,
    price_per_liter_milli: pricePerLiterMilli,
    total_cts: totalCts,
    fuel_type: null,
    mileage_km: null,
    station: null,
    tva_rate: 20,
    tva_deductible_pct: 100,
    receipt_url: null,
    supplier_id: null,
  }

  return {
    ok: true,
    action: {
      title: 'Enregistrer un plein',
      lines: [
        { label: 'Véhicule', value: `${v.vehicle.label} (${v.vehicle.plate})` },
        { label: 'Montant TTC', value: `${centimesToEuros(totalCts)} €` },
        { label: 'Litres', value: `${args.litres} L` },
        { label: 'Date', value: date },
      ],
      confirmLabel: 'Confirmer',
      run: async () => {
        const { error } = await createFuelLog(payload)
        if (error) return `❌ La création a échoué : ${(error as Error).message}.`
        return `✅ Plein enregistré : ${v.vehicle.label}, ${centimesToEuros(totalCts)} € TTC, ${args.litres} L, ${date}.`
      },
    },
  }
}

// ── d) create_incident ────────────────────────────────────────────────────────
// Réutilise createIncident() (onglet Incidents). status défaut 'ouvert',
// police_report défaut false ; véhicule optionnel (tous statuts comme le drawer).

export interface CreateIncidentArgs {
  description?: string
  date?: string
  vehicule?: string
  type?: string
}

const INCIDENT_TYPES = ['accident', 'panne', 'vol', 'vandalisme', 'infraction', 'autre']

export async function prepareCreateIncident(args: CreateIncidentArgs): Promise<PrepareResult> {
  const description = (args.description ?? '').trim()
  if (!description) return { ok: false, message: 'Précise la description de l’incident.' }
  const date = (args.date ?? '').trim()
  if (!isoDateValid(date)) return { ok: false, message: 'Date invalide : indique une date au format AAAA-MM-JJ.' }
  const companyId = await getCompanyId()
  if (!companyId) return { ok: false, message: 'Profil non chargé : impossible de créer l’incident.' }

  // Véhicule optionnel : résolu si fourni (tous statuts, comme le drawer Incidents).
  let vehicleId: string | null = null
  let vehiculeLabel = '—'
  const rawV = (args.vehicule ?? '').trim()
  if (rawV) {
    const v = await resolveVehicule(rawV, false)
    if (!v.ok) return v
    vehicleId = v.vehicle.id
    vehiculeLabel = `${v.vehicle.label} (${v.vehicle.plate})`
  }

  const type = (args.type && INCIDENT_TYPES.includes(args.type) ? args.type : null) as IncidentType | null

  const payload: IncidentInsert = {
    company_id: companyId,
    vehicle_id: vehicleId,
    driver_id: null,
    date,
    type,
    description,
    location: null,
    damage_cts: null,
    at_fault: null,
    status: 'ouvert',
    police_report: false,
    insurance_ref: null,
    notes: null,
  }

  return {
    ok: true,
    action: {
      title: 'Signaler un incident',
      lines: [
        { label: 'Description', value: description },
        { label: 'Type', value: type ? (INCIDENT_TYPE_LABELS[type] ?? type) : '—' },
        { label: 'Véhicule', value: vehiculeLabel },
        { label: 'Date', value: date },
      ],
      confirmLabel: 'Confirmer',
      run: async () => {
        const { error } = await createIncident(payload)
        if (error) return `❌ La création a échoué : ${(error as Error).message}.`
        return `✅ Incident enregistré : ${description.slice(0, 60)}, ${date}.`
      },
    },
  }
}

// ── e) create_fournisseur ─────────────────────────────────────────────────────
// Réutilise createSupplier() (onglet Fournisseurs). On n'envoie QUE des colonnes
// réelles de `suppliers` (pas de `siren` : présent dans le type TS, absent de la table).

export interface CreateFournisseurArgs {
  nom?: string
  categorie?: string
  email?: string
  telephone?: string
  adresse?: string
}

const SUPPLIER_CATEGORIES = ['carburant', 'assurance', 'entretien', 'soustraitance', 'logiciel', 'telecom', 'autre']

export async function prepareCreateFournisseur(args: CreateFournisseurArgs): Promise<PrepareResult> {
  const nom = (args.nom ?? '').trim()
  if (!nom) return { ok: false, message: 'Précise le nom du fournisseur.' }
  const companyId = await getCompanyId()
  if (!companyId) return { ok: false, message: 'Profil non chargé : impossible de créer le fournisseur.' }

  const category = (args.categorie && SUPPLIER_CATEGORIES.includes(args.categorie)
    ? args.categorie : null) as SupplierInsert['category']

  // Uniquement des colonnes réelles → cast via unknown (le type SupplierInsert
  // déclare `siren`, qui n'existe pas en base).
  const payload = {
    company_id: companyId,
    name: nom,
    category,
    address: args.adresse?.trim() || null,
    email: args.email?.trim() || null,
    phone: args.telephone?.trim() || null,
    active: true,
  } as unknown as SupplierInsert

  return {
    ok: true,
    action: {
      title: 'Créer un fournisseur',
      lines: [
        { label: 'Nom', value: nom },
        { label: 'Catégorie', value: getCategoryLabel(category) },
        { label: 'Email', value: (args.email?.trim() || '') || '—' },
        { label: 'Téléphone', value: (args.telephone?.trim() || '') || '—' },
      ],
      confirmLabel: 'Confirmer',
      run: async () => {
        const { error } = await createSupplier(payload)
        if (error) return `❌ La création a échoué : ${(error as Error).message}.`
        return `✅ Fournisseur créé : ${nom}.`
      },
    },
  }
}

// ── f) create_vehicule ────────────────────────────────────────────────────────
// Réutilise createVehicle() (onglet Véhicules). status 'active', mileage_km 0.
// label = nom, sinon "marque modèle", sinon la plaque.

export interface CreateVehiculeArgs {
  plaque?: string
  nom?: string
  marque?: string
  modele?: string
  carburant?: string
}

// L'Edge déclare le carburant en FRANÇAIS (electrique/hybride/gpl) ; la base
// attend les valeurs DB (electric/hybrid/lpg). On normalise dans les deux sens.
const FUEL_NORMALIZE: Record<string, VehicleInsert['fuel_type']> = {
  diesel: 'diesel', essence: 'essence',
  electrique: 'electric', electric: 'electric',
  hybride: 'hybrid', hybrid: 'hybrid',
  gpl: 'lpg', lpg: 'lpg',
}

export async function prepareCreateVehicule(args: CreateVehiculeArgs): Promise<PrepareResult> {
  const plate = (args.plaque ?? '').trim()
  if (!plate) return { ok: false, message: 'Précise la plaque du véhicule.' }
  const companyId = await getCompanyId()
  if (!companyId) return { ok: false, message: 'Profil non chargé : impossible de créer le véhicule.' }

  const brand = args.marque?.trim() || null
  const model = args.modele?.trim() || null
  const nom = args.nom?.trim()
  const label = nom || [brand, model].filter(Boolean).join(' ').trim() || plate
  const fuel_type = (args.carburant ? FUEL_NORMALIZE[args.carburant.trim().toLowerCase()] ?? null : null)

  // Colonnes réelles uniquement ; les autres prennent les défauts en base.
  const payload = {
    company_id: companyId,
    label,
    plate,
    brand,
    model,
    fuel_type,
    status: 'active',
    mileage_km: 0,
  } as unknown as VehicleInsert

  return {
    ok: true,
    action: {
      title: 'Ajouter un véhicule',
      lines: [
        { label: 'Plaque', value: plate },
        { label: 'Nom', value: label },
        { label: 'Marque', value: brand || '—' },
        { label: 'Modèle', value: model || '—' },
        { label: 'Carburant', value: fuel_type ? (FUEL_LABELS[fuel_type] ?? fuel_type) : '—' },
      ],
      confirmLabel: 'Confirmer',
      run: async () => {
        const { error } = await createVehicle(payload)
        if (error) return `❌ La création a échoué : ${(error as Error).message}.`
        return `✅ Véhicule ajouté : ${label} (${plate}).`
      },
    },
  }
}

// ═══════════════════════ RÉDACTION — generer_mail (brouillon, pas d'écriture) ══
// Réutilise la query de l'onglet Brouillons IA (generateDraft → Edge brouillons-generate,
// Mistral large). Aucune écriture base, aucune carte de confirmation.

export interface GenererMailArgs {
  type?: string
  instructions?: string
}

const DRAFT_TYPES = ['relance', 'email', 'annonce', 'libre']

export async function runGenererMail(
  args: GenererMailArgs,
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const instructions = (args.instructions ?? '').trim()
  if (!instructions) {
    return { ok: false, message: 'Précise ce que je dois rédiger (destinataire, objet, ton, montants, dates…).' }
  }
  const type = (args.type && DRAFT_TYPES.includes(args.type) ? args.type : 'libre') as DraftType

  const { data, error } = await generateDraft(instructions, type)
  const res = data as { ok?: boolean; data?: { text?: string }; error?: string } | null

  if (error || res?.ok === false) {
    const raw = error?.message ?? res?.error ?? 'Échec de la génération.'
    const msg = /rate|429|trop de demandes/i.test(String(raw))
      ? '⏳ L’assistant reçoit trop de demandes à la fois — patiente quelques secondes et réessaie.'
      : `❌ Génération impossible : ${raw}.`
    return { ok: false, message: msg }
  }

  const text = res?.data?.text ?? ''
  if (!text.trim()) return { ok: false, message: 'Le brouillon est revenu vide — reformule ta demande.' }
  return { ok: true, text }
}

// ═══════════════════════ OCR — extraction d'une feuille de route (affichage) ═══
// Réutilise extractDeliveries() de l'onglet Copilote IA (Edge ai-extract-deliveries,
// OCR + extraction). LECTURE SEULE : aucune création ici (volet 6B-2). On affiche.

export type ExtractResult =
  | { ok: true; deliveries: ExtractedDelivery[]; text: string }
  | { ok: false; message: string }

function formatExtracted(deliveries: ExtractedDelivery[]): string {
  const n = deliveries.length
  const lines = deliveries.map((d, i) => {
    const parts = [
      d.client_name ?? 'client ?',
      d.date ?? 'date ?',
      d.delivery_address ?? null,
      d.montant_ht_eur != null ? `${d.montant_ht_eur} € HT` : null,
    ].filter(Boolean)
    let line = `**${i + 1}.** ${parts.join(' · ')}`
    if (Array.isArray(d.missing) && d.missing.length) {
      line += `\n   ⚠️ à compléter : ${d.missing.join(', ')}`
    }
    return line
  })
  return (
    `📋 J'ai lu ${n} livraison${n > 1 ? 's' : ''} dans la feuille de route :\n\n`
    + lines.join('\n')
    + `\n\n(Vérifie le contenu — la création en lot arrive bientôt.)`
  )
}

export async function runExtractDeliveries(fileBase64: string, mimeType: string): Promise<ExtractResult> {
  const { data, error } = await extractDeliveries({ fileBase64, mimeType })
  const res = data as ExtractResponse | null

  if (error || res?.ok === false) {
    const raw = error?.message ?? res?.error ?? "Échec de l'analyse."
    const msg = /timeout|abort|temps|504|deadline/i.test(String(raw))
      ? '⏳ La lecture a pris trop de temps — réessaie avec une image plus nette ou plus légère.'
      : `❌ Lecture impossible : ${raw}.`
    return { ok: false, message: msg }
  }

  const deliveries = res?.data?.deliveries ?? []
  if (deliveries.length === 0) {
    return { ok: false, message: "Je n'ai trouvé aucune livraison dans ce document. Vérifie la photo / le PDF, ou colle le texte directement." }
  }
  return { ok: true, deliveries, text: formatExtracted(deliveries) }
}

// ═══════════════════════ OCR 6B-2 — création EN LOT des livraisons extraites ═══
// Réutilise getClients (résolution), createClient (nouveaux clients), createDelivery
// + computeAmount (montants, comme create_livraison). client_id NOT NULL ; montant
// nullable (jamais 0 €) ; colonnes générées jamais écrites. Confirmation obligatoire.

const normName = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()

function clientPayloadFromName(companyId: string, name: string): ClientInsert {
  return {
    company_id: companyId, name: normalizeClientName(name),
    siret: null, tva_intra: null, address: null, city: null, postal_code: null,
    email: null, phone: null, type: null, payment_terms: 30, payment_terms_label: '30', notes: null,
    active: true, tariff_mode: 'manuel', tariff_rate_cts: null,
  }
}

export async function prepareImportLivraisons(
  deliveries: ExtractedDelivery[],
  statut: 'planifiee' | 'livree',
): Promise<PrepareResult> {
  const companyId = await getCompanyId()
  if (!companyId) return { ok: false, message: 'Profil non chargé : impossible de créer les livraisons.' }

  const { data: clientsData } = await getClients({ active: true })
  const clients = (clientsData ?? []) as { id: string; name: string }[]
  const matchClient = (name: string): string | null => {
    const q = normName(name)
    const exact = clients.find(c => normName(c.name) === q)
    if (exact) return exact.id
    const partial = clients.find(c => normName(c.name).includes(q) || q.includes(normName(c.name)))
    return partial?.id ?? null
  }

  interface Planned {
    clientName: string
    existingClientId: string | null  // null → nouveau client à créer
    date: string
    amount_ht_cts: number | null
    tva_cts: number | null
    amount_ttc_cts: number | null
    d: ExtractedDelivery
  }
  const planned: Planned[] = []
  const newClientNames = new Set<string>()  // clés normalisées
  const newClientLabels = new Map<string, string>()
  let excluded = 0

  for (const d of deliveries) {
    const name = (d.client_name ?? '').trim()
    if (!name) { excluded++; continue }
    const existingClientId = matchClient(name)
    if (!existingClientId) {
      const key = normName(name)
      newClientNames.add(key)
      if (!newClientLabels.has(key)) newClientLabels.set(key, name)
    }
    // Montant : present → computeAmount (TVA auto 20 %, comme create_livraison) ; absent → null.
    let amount_ht_cts: number | null = null, tva_cts: number | null = null, amount_ttc_cts: number | null = null
    if (typeof d.montant_ht_eur === 'number' && d.montant_ht_eur > 0) {
      const c = computeAmount({ tariff_mode: 'manuel', tariff_rate_cts: null }, { manual_ht_cts: Math.round(d.montant_ht_eur * 100) })
      amount_ht_cts = c?.amount_ht_cts ?? null
      tva_cts = c?.tva_cts ?? null
      amount_ttc_cts = c?.amount_ttc_cts ?? null
    }
    const date = d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : todayISO()
    planned.push({ clientName: name, existingClientId, date, amount_ht_cts, tva_cts, amount_ttc_cts, d })
  }

  if (planned.length === 0) {
    return { ok: false, message: `Aucune livraison créable : ${deliveries.length} ligne(s), toutes sans nom de client. Complète les clients puis réessaie.` }
  }

  const statutLabel = statut === 'planifiee' ? 'Planifiée' : 'Livrée'
  const nbNew = newClientNames.size
  const nbNoAmount = planned.filter(p => p.amount_ht_cts == null).length

  const lines: { label: string; value: string }[] = planned.slice(0, 20).map((p, i) => {
    const tag = p.existingClientId ? '' : ' (nouveau)'
    const montant = p.amount_ht_cts != null ? `${p.amount_ht_cts / 100} € HT` : 'sans montant'
    return { label: `${i + 1}.`, value: `${p.clientName}${tag} · ${p.date} · ${montant}` }
  })
  if (planned.length > 20) lines.push({ label: '…', value: `+ ${planned.length - 20} autre(s)` })
  if (nbNew > 0) {
    const names = [...newClientLabels.values()]
    lines.push({ label: 'Nouveaux clients', value: names.slice(0, 8).join(', ') + (names.length > 8 ? '…' : '') })
  }
  if (nbNoAmount > 0) lines.push({ label: 'Sans montant', value: `${nbNoAmount} (à compléter)` })
  if (excluded > 0) lines.push({ label: 'Ignorées', value: `${excluded} (client manquant)` })

  return {
    ok: true,
    action: {
      title: `${planned.length} livraison${planned.length > 1 ? 's' : ''} · statut : ${statutLabel}`,
      lines,
      confirmLabel: `Créer ${planned.length} livraison${planned.length > 1 ? 's' : ''}`,
      run: async () => {
        // 1) Nouveaux clients (nom normalisé → id).
        const newIdByKey = new Map<string, string>()
        let errors = 0
        for (const key of newClientNames) {
          const label = newClientLabels.get(key) ?? key
          const { data, error } = await createClient(clientPayloadFromName(companyId, label))
          if (error || !data) { errors++; continue }
          newIdByKey.set(key, (data as { id: string }).id)
        }

        // 2) Livraisons (tolère les échecs par ligne).
        let created = 0
        for (const p of planned) {
          const clientId = p.existingClientId ?? newIdByKey.get(normName(p.clientName)) ?? null
          if (!clientId) { errors++; continue }  // nouveau client non créé → on saute
          const type = (p.d.type ?? null) as DeliveryType | null
          const payload: DeliveryInsert = {
            company_id: companyId,
            client_id: clientId,
            date: p.date,
            statut,
            vehicle_id: null,
            driver_id: null,
            type,
            description: p.d.notes?.trim() || null,
            pickup_address: p.d.pickup_address?.trim() || null,
            delivery_address: p.d.delivery_address?.trim() || null,
            delivery_lat: null,
            delivery_lng: null,
            km: typeof p.d.km === 'number' ? p.d.km : null,
            empty_km: null,
            weight_kg: typeof p.d.weight_kg === 'number' ? p.d.weight_kg : null,
            amount_ht_cts: p.amount_ht_cts,
            tva_cts: p.tva_cts,
            amount_ttc_cts: p.amount_ttc_cts,
            invoiced_at: null,
            paid_at: null,
            notes: null,
          }
          const { error } = await createDelivery(payload)
          if (error) errors++; else created++
        }

        const nbCreatedClients = newIdByKey.size
        let msg = `✅ ${created} livraison${created > 1 ? 's' : ''} créée${created > 1 ? 's' : ''}`
        if (nbCreatedClients > 0) msg += ` (dont ${nbCreatedClients} nouveau${nbCreatedClients > 1 ? 'x' : ''} client${nbCreatedClients > 1 ? 's' : ''})`
        msg += '.'
        if (nbNoAmount > 0) msg += ` ${nbNoAmount} sans montant à compléter.`
        if (errors > 0) msg += ` ⚠️ ${errors} en échec.`
        return msg
      },
    },
  }
}
