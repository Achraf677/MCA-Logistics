// Moteur de détection d'alertes — fonctions PURES (sans DB ni DOM).
// Calcul des jours via les helpers de dates partagés ; jamais toISOString().slice.

import { computeEcheance } from '../../shared/lib/echeances'
import { toLocalISO } from '../../shared/lib/dates'
import type {
  Alert,
  AlertCategory,
  AlertSeverity,
  AlertThresholds,
  AlertsInput,
  AlertsSummary,
  CompanyAlertRow,
  DeliveryAlertRow,
  DriverAlertRow,
  IncidentAlertRow,
  InspectionAlertRow,
  MaintenanceAlertRow,
  VehicleAlertRow,
} from './alertes.types'
import { DEFAULT_THRESHOLDS } from './alertes.types'

// ── Helpers purs ─────────────────────────────────────────────────────────────

/** Jours restants avant `date` (négatif = dépassé), via helper d'échéances. null si date absente. */
function daysLeftUntil(date: string | null, today: Date): number | null {
  return computeEcheance(date, today).daysLeft
}

/** Décale une date ISO de `days` jours, retourne ISO local (pas de toISOString). */
function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return toLocalISO(d)
}

/** Sévérité d'une échéance datée : < 0 → critique, ≤ urgent → urgent, ≤ warning → warning, sinon null. */
function expirySeverity(daysLeft: number, t: AlertThresholds): AlertSeverity | null {
  if (daysLeft < 0) return 'critique'
  if (daysLeft <= t.urgentDays) return 'urgent'
  if (daysLeft <= t.warningDays) return 'warning'
  return null
}

// ── Détecteurs par catégorie ─────────────────────────────────────────────────

const VEHICLE_FIELDS: Array<{ key: string; field: keyof VehicleAlertRow; label: string }> = [
  { key: 'ct',        field: 'ct_expiry',          label: 'Contrôle technique' },
  { key: 'assurance', field: 'insurance_expiry',   label: 'Assurance' },
  { key: 'revision',  field: 'next_revision_date', label: 'Révision' },
]

function detectVehicles(rows: VehicleAlertRow[], today: Date, t: AlertThresholds): Alert[] {
  const out: Alert[] = []
  for (const v of rows) {
    for (const { key, field, label } of VEHICLE_FIELDS) {
      const date = v[field] as string | null
      const daysLeft = daysLeftUntil(date, today)
      if (daysLeft === null) continue
      const severity = expirySeverity(daysLeft, t)
      if (!severity) continue
      out.push({
        id: `vehicles:${v.id}:${key}`,
        category: 'vehicule',
        severity,
        title: `${label} — ${v.label}`,
        detail: dueDetail(date as string, daysLeft),
        dueDate: date,
        daysLeft,
        ref: { table: 'vehicles', id: v.id },
      })
    }

    // Véhicule immobilisé en maintenance (info, sans échéance).
    if (v.status === 'maintenance') {
      out.push({
        id: `vehicles:${v.id}:maintenance`,
        category: 'vehicule',
        severity: 'info',
        title: 'Véhicule en maintenance',
        detail: `${v.label} actuellement en maintenance`,
        dueDate: null,
        daysLeft: null,
        ref: { table: 'vehicles', id: v.id },
      })
    }
  }
  return out
}

const DRIVER_FIELDS: Array<{ key: string; field: keyof DriverAlertRow; label: string }> = [
  { key: 'permis',  field: 'licence_b_expiry',     label: 'Permis B' },
  { key: 'visite',  field: 'medical_visit_expiry', label: 'Visite médicale' },
]

function detectDrivers(rows: DriverAlertRow[], today: Date, t: AlertThresholds): Alert[] {
  const out: Alert[] = []
  for (const d of rows) {
    for (const { key, field, label } of DRIVER_FIELDS) {
      const date = d[field] as string | null
      const daysLeft = daysLeftUntil(date, today)
      if (daysLeft === null) continue
      const severity = expirySeverity(daysLeft, t)
      if (!severity) continue
      out.push({
        id: `team_members:${d.id}:${key}`,
        category: 'chauffeur',
        severity,
        title: `${label} — ${d.full_name}`,
        detail: dueDetail(date as string, daysLeft),
        dueDate: date,
        daysLeft,
        ref: { table: 'team_members', id: d.id },
      })
    }

    // Fin de CDD proche (actif, échéance dans [today, today+warningDays]).
    // N'alerte pas si end_date déjà passée : contrat terminé → aucune action.
    if (d.contract_type === 'cdd' && d.active && d.end_date) {
      const daysLeft = daysLeftUntil(d.end_date, today)
      if (daysLeft !== null && daysLeft >= 0 && daysLeft <= t.warningDays) {
        const severity: AlertSeverity = daysLeft <= t.urgentDays ? 'urgent' : 'warning'
        out.push({
          id: `team_members:${d.id}:cdd`,
          category: 'rh',
          severity,
          title: 'Fin de CDD',
          detail: `${d.full_name} — fin de contrat le ${d.end_date} (dans ${daysLeft} j)`,
          dueDate: d.end_date,
          daysLeft,
          ref: { table: 'team_members', id: d.id },
        })
      }
    }
  }
  return out
}

function detectMaintenances(rows: MaintenanceAlertRow[], today: Date, t: AlertThresholds): Alert[] {
  const out: Alert[] = []
  for (const m of rows) {
    const daysLeft = daysLeftUntil(m.next_due_date, today)
    if (daysLeft === null) continue
    const severity = expirySeverity(daysLeft, t)
    if (!severity) continue
    const who = m.vehicleLabel ? ` — ${m.vehicleLabel}` : ''
    out.push({
      id: `vehicle_maintenances:${m.id}:next_due`,
      category: 'entretien',
      severity,
      title: `Entretien à prévoir${who}`,
      detail: dueDetail(m.next_due_date as string, daysLeft),
      dueDate: m.next_due_date,
      daysLeft,
      ref: { table: 'vehicle_maintenances', id: m.id },
    })
  }
  return out
}

function detectDeliveries(rows: DeliveryAlertRow[], today: Date, t: AlertThresholds): Alert[] {
  const out: Alert[] = []
  for (const d of rows) {
    // Livraison en retard : planifiée et date dépassée.
    if (d.statut === 'planifiee') {
      const daysLeft = daysLeftUntil(d.date, today)
      if (daysLeft !== null && daysLeft < 0) {
        const overdue = -daysLeft
        const severity: AlertSeverity = overdue > t.lateDeliveryUrgentDays ? 'urgent' : 'warning'
        const who = d.clientName ? ` — ${d.clientName}` : ''
        out.push({
          id: `deliveries:${d.id}:retard`,
          category: 'livraison',
          severity,
          title: `Livraison en retard${who}`,
          detail: `Planifiée le ${d.date}, en retard de ${overdue} j`,
          dueDate: d.date,
          daysLeft,
          ref: { table: 'deliveries', id: d.id },
        })
      }
    }

    // Facture impayée : facturée, échéance (invoiced_at + payment_terms) dépassée, non payée.
    if (d.statut === 'facturee' && d.invoiced_at && !d.paid_at) {
      const terms = d.payment_terms ?? 30
      const dueDate = addDays(d.invoiced_at, terms)
      const daysLeft = daysLeftUntil(dueDate, today)
      if (daysLeft !== null && daysLeft < 0) {
        const overdue = -daysLeft
        const severity: AlertSeverity = overdue > t.invoiceUrgentDays ? 'urgent' : 'warning'
        const who = d.clientName ? ` — ${d.clientName}` : ''
        out.push({
          id: `deliveries:${d.id}:impaye`,
          category: 'facture',
          severity,
          title: `Facture impayée${who}`,
          detail: `Échéance le ${dueDate}, dépassée de ${overdue} j`,
          dueDate,
          daysLeft,
          ref: { table: 'deliveries', id: d.id },
        })
      }
    }
  }
  return out
}

function detectIncidents(rows: IncidentAlertRow[], today: Date, t: AlertThresholds): Alert[] {
  const out: Alert[] = []
  for (const inc of rows) {
    if (inc.status !== 'ouvert' && inc.status !== 'en_cours') continue
    const daysLeft = daysLeftUntil(inc.date, today)
    // Âge de l'incident en jours (date passée → daysLeft négatif).
    const ageDays = daysLeft === null ? 0 : Math.max(0, -daysLeft)
    const severity: AlertSeverity = ageDays > t.incidentUrgentDays ? 'urgent' : 'warning'
    const who = inc.vehicleLabel ? ` — ${inc.vehicleLabel}` : ''
    out.push({
      id: `incidents:${inc.id}:ouvert`,
      category: 'incident',
      severity,
      title: `Incident non clos${who}`,
      detail: `Ouvert le ${inc.date} (depuis ${ageDays} j)`,
      dueDate: inc.date,
      daysLeft,
      ref: { table: 'incidents', id: inc.id },
    })
  }
  return out
}

const COMPANY_FIELDS: Array<{ key: string; field: keyof CompanyAlertRow; label: string }> = [
  { key: 'transport_license', field: 'transport_license_expiry', label: 'Licence de transport (DREAL)' },
  { key: 'rc_pro',            field: 'rc_pro_expiry',            label: 'Assurance RC pro + marchandises' },
]

function detectCompany(company: CompanyAlertRow | null | undefined, today: Date, t: AlertThresholds): Alert[] {
  if (!company) return []
  const out: Alert[] = []
  for (const { key, field, label } of COMPANY_FIELDS) {
    const date = company[field] as string | null
    const daysLeft = daysLeftUntil(date, today)
    if (daysLeft === null) continue
    const severity = expirySeverity(daysLeft, t)
    if (!severity) continue
    out.push({
      id: `companies:${company.id}:${key}`,
      category: 'conformite',
      severity,
      title: label,
      detail: dueDetail(date as string, daysLeft),
      dueDate: date,
      daysLeft,
      ref: { table: 'companies', id: company.id },
    })
  }
  return out
}

function detectInspections(rows: InspectionAlertRow[], today: Date): Alert[] {
  const out: Alert[] = []
  for (const ins of rows) {
    if (ins.status !== 'defauts' && ins.status !== 'refuse') continue
    const daysLeft = daysLeftUntil(ins.date, today)
    const who = ins.vehicleLabel ? ` — ${ins.vehicleLabel}` : ''
    const label = ins.status === 'refuse' ? 'refusée' : 'avec défauts'
    out.push({
      id: `inspections:${ins.id}:${ins.status}`,
      category: 'inspection',
      severity: 'urgent',
      title: `Inspection ${label}${who}`,
      detail: `Inspection du ${ins.date} : ${label}`,
      dueDate: ins.date,
      daysLeft,
      ref: { table: 'inspections', id: ins.id },
    })
  }
  return out
}

/** Détail lisible d'une échéance datée. */
function dueDetail(date: string, daysLeft: number): string {
  if (daysLeft < 0) return `Échéance le ${date}, dépassée de ${-daysLeft} j`
  if (daysLeft === 0) return `Échéance aujourd'hui (${date})`
  return `Échéance le ${date}, dans ${daysLeft} j`
}

// ── Tri & déduplication ──────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critique: 0,
  urgent: 1,
  warning: 2,
  info: 3,
}

/** Déduplique par id (= `${table}:${id}:${type}`), gardant la première occurrence. */
function dedupe(alerts: Alert[]): Alert[] {
  const seen = new Set<string>()
  const out: Alert[] = []
  for (const a of alerts) {
    if (seen.has(a.id)) continue
    seen.add(a.id)
    out.push(a)
  }
  return out
}

/** Tri : sévérité (critique→info) puis dueDate croissant (dates absentes en dernier). */
function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sev !== 0) return sev
    const da = a.dueDate ?? null
    const db = b.dueDate ?? null
    if (da === db) return 0
    if (da === null) return 1
    if (db === null) return -1
    return da < db ? -1 : 1
  })
}

// ── API publique ─────────────────────────────────────────────────────────────

/** Détecte toutes les alertes à partir des projections, dédupliquées et triées. */
export function detectAlerts(
  input: AlertsInput,
  today: Date = new Date(),
  thresholds: AlertThresholds = DEFAULT_THRESHOLDS,
): Alert[] {
  const all: Alert[] = [
    ...detectVehicles(input.vehicles ?? [], today, thresholds),
    ...detectDrivers(input.drivers ?? [], today, thresholds),
    ...detectMaintenances(input.maintenances ?? [], today, thresholds),
    ...detectDeliveries(input.deliveries ?? [], today, thresholds),
    ...detectIncidents(input.incidents ?? [], today, thresholds),
    ...detectInspections(input.inspections ?? [], today),
    ...detectCompany(input.company, today, thresholds),
  ]
  return sortAlerts(dedupe(all))
}

const EMPTY_SEVERITE: Record<AlertSeverity, number> = { info: 0, warning: 0, urgent: 0, critique: 0 }
const EMPTY_CATEGORIE: Record<AlertCategory, number> = {
  vehicule: 0, chauffeur: 0, entretien: 0, livraison: 0, facture: 0, incident: 0, inspection: 0, rh: 0, conformite: 0,
}

/** Agrège les alertes par sévérité et par catégorie. */
export function summarizeAlerts(alerts: Alert[]): AlertsSummary {
  const parSeverite = { ...EMPTY_SEVERITE }
  const parCategorie = { ...EMPTY_CATEGORIE }
  for (const a of alerts) {
    parSeverite[a.severity] += 1
    parCategorie[a.category] += 1
  }
  return { total: alerts.length, parSeverite, parCategorie }
}
