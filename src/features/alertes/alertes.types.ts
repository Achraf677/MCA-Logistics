// Types du moteur de détection d'alertes (étape 1 — moteur pur, sans refonte UI).
// Aucune dépendance aux autres features : les shapes d'entrée sont minimales et locales.

export type AlertSeverity = 'info' | 'warning' | 'urgent' | 'critique'

export type AlertCategory =
  | 'vehicule'
  | 'chauffeur'
  | 'entretien'
  | 'livraison'
  | 'facture'
  | 'incident'
  | 'inspection'
  | 'rh'
  | 'conformite'

export interface Alert {
  /** Identité stable = clé de déduplication `${table}:${id}:${type}`. */
  id: string
  category: AlertCategory
  severity: AlertSeverity
  title: string
  detail: string
  /** Date d'échéance pertinente (ISO yyyy-mm-dd) si applicable. */
  dueDate?: string | null
  /** Référence vers la ligne source pour navigation/ouverture. */
  ref: { table: string; id: string }
  /** Jours restants avant échéance (négatif = dépassé) si applicable. */
  daysLeft?: number | null
}

// ── Seuils paramétrables (en jours) ──────────────────────────────────────────

export interface AlertThresholds {
  /** Échéance ≤ ce nombre de jours → urgent (et < 0 → critique). */
  urgentDays: number
  /** Échéance ≤ ce nombre de jours → warning. */
  warningDays: number
  /** Retard de livraison (planifiée) au-delà → urgent (sinon warning). */
  lateDeliveryUrgentDays: number
  /** Facture dépassée de plus de N jours → urgent (sinon warning). */
  invoiceUrgentDays: number
  /** Incident ouvert depuis plus de N jours → urgent (sinon warning). */
  incidentUrgentDays: number
}

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  urgentDays: 7,
  warningDays: 30,
  lateDeliveryUrgentDays: 3,
  invoiceUrgentDays: 15,
  incidentUrgentDays: 14,
}

// ── Shapes d'entrée du moteur (projections minimales) ────────────────────────

export interface VehicleAlertRow {
  id: string
  label: string
  plate?: string | null
  status?: string | null
  ct_expiry: string | null
  insurance_expiry: string | null
  next_revision_date: string | null
}

export interface DriverAlertRow {
  id: string
  full_name: string
  licence_b_expiry: string | null
  medical_visit_expiry: string | null
  contract_type?: string | null
  end_date?: string | null
  active?: boolean | null
}

export interface MaintenanceAlertRow {
  id: string
  type: string | null
  next_due_date: string | null
  vehicleLabel?: string | null
}

export interface DeliveryAlertRow {
  id: string
  statut: string
  /** Colonne `date` = date planifiée. */
  date: string
  invoiced_at: string | null
  paid_at: string | null
  clientName?: string | null
  /** Délai de paiement client en jours (défaut 30 fourni par la query). */
  payment_terms: number
}

export interface IncidentAlertRow {
  id: string
  status: string
  date: string
  type?: string | null
  vehicleLabel?: string | null
}

export interface InspectionAlertRow {
  id: string
  status: string
  date: string
  vehicleLabel?: string | null
}

export interface CompanyAlertRow {
  id: string
  transport_license_expiry: string | null
  rc_pro_expiry: string | null
}

export interface AlertsInput {
  vehicles: VehicleAlertRow[]
  drivers: DriverAlertRow[]
  maintenances: MaintenanceAlertRow[]
  deliveries: DeliveryAlertRow[]
  incidents: IncidentAlertRow[]
  inspections: InspectionAlertRow[]
  company?: CompanyAlertRow | null
}

export interface AlertsSummary {
  total: number
  parSeverite: Record<AlertSeverity, number>
  parCategorie: Record<AlertCategory, number>
}
