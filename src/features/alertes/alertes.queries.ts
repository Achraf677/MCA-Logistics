import { supabase } from '../../app/providers'
import type { Alert, AlertsInput } from './alertes.types'

/** Charge les projections nécessaires au moteur de détection (alertes.logic.ts). */
export async function getAlertesDetectionData(): Promise<AlertsInput> {
  const [vehicles, drivers, maintenances, deliveries, incidents, inspections] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id, label, plate, status, ct_expiry, insurance_expiry, next_revision_date')
      .neq('status', 'inactive'),
    supabase
      .from('team_members')
      .select('id, full_name, licence_b_expiry, medical_visit_expiry, contract_type, end_date, active')
      .eq('active', true),
    supabase
      .from('vehicle_maintenances')
      .select('id, type, next_due_date, vehicles!vehicle_id(label)')
      .not('next_due_date', 'is', null),
    supabase
      .from('deliveries')
      .select('id, statut, date, invoiced_at, paid_at, clients!client_id(name, payment_terms)')
      .in('statut', ['planifiee', 'facturee']),
    supabase
      .from('incidents')
      .select('id, status, date, type, vehicles!vehicle_id(label)')
      .in('status', ['ouvert', 'en_cours']),
    supabase
      .from('inspections')
      .select('id, status, date, vehicles!vehicle_id(label)')
      .in('status', ['defauts', 'refuse']),
  ])

  const join = (row: { label?: string } | { label?: string }[] | null): string | null =>
    (Array.isArray(row) ? row[0]?.label : row?.label) ?? null

  return {
    vehicles: (vehicles.data ?? []).map(v => ({
      id: v.id,
      label: v.label,
      plate: v.plate,
      status: v.status,
      ct_expiry: v.ct_expiry,
      insurance_expiry: v.insurance_expiry,
      next_revision_date: v.next_revision_date,
    })),
    drivers: (drivers.data ?? []).map(d => ({
      id: d.id,
      full_name: d.full_name,
      licence_b_expiry: d.licence_b_expiry,
      medical_visit_expiry: d.medical_visit_expiry,
      contract_type: d.contract_type,
      end_date: d.end_date,
      active: d.active,
    })),
    maintenances: (maintenances.data ?? []).map(m => ({
      id: m.id,
      type: m.type,
      next_due_date: m.next_due_date,
      vehicleLabel: join(m.vehicles as never),
    })),
    deliveries: (deliveries.data ?? []).map(d => {
      const client = (Array.isArray(d.clients) ? d.clients[0] : d.clients) as
        | { name?: string; payment_terms?: number }
        | null
      return {
        id: d.id,
        statut: d.statut,
        date: d.date,
        invoiced_at: d.invoiced_at,
        paid_at: d.paid_at,
        clientName: client?.name ?? null,
        payment_terms: client?.payment_terms ?? 30,
      }
    }),
    incidents: (incidents.data ?? []).map(i => ({
      id: i.id,
      status: i.status,
      date: i.date,
      type: i.type,
      vehicleLabel: join(i.vehicles as never),
    })),
    inspections: (inspections.data ?? []).map(i => ({
      id: i.id,
      status: i.status,
      date: i.date,
      vehicleLabel: join(i.vehicles as never),
    })),
  }
}

/**
 * Génère le briefing du jour via l'Edge Function `alertes-briefing` (IA Mistral).
 * Retourne le texte du briefing si ok, sinon lève une erreur.
 */
export async function getAlertesBriefing(alerts: Alert[], today: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('alertes-briefing', {
    body: {
      alerts: alerts.map(a => ({
        severity: a.severity,
        category: a.category,
        title: a.title,
        detail: a.detail,
        daysLeft: a.daysLeft,
      })),
      today,
    },
  })

  if (error) throw new Error(error.message)
  if (!data?.ok) throw new Error(data?.error ?? 'Échec de la génération du briefing.')
  return data.data.briefing as string
}
