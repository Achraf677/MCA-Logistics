import { supabase } from '../../app/providers'
import type { AlertsInput } from './alertes.types'

export async function getAlertesData() {
  const today            = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo   = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const thirtyDaysAhead = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

  const [overdueMaintenances, oldInvoiced, maintenanceVehicles, expiringContracts] = await Promise.all([
    supabase
      .from('vehicle_maintenances')
      .select('id, type, next_due_date, vehicles!vehicle_id(label, plate)')
      .lt('next_due_date', today)
      .not('next_due_date', 'is', null)
      .order('next_due_date'),
    supabase
      .from('deliveries')
      .select('id, date, amount_ttc_cts, clients!client_id(name)')
      .eq('statut', 'facturee')
      .lt('date', thirtyDaysAgo)
      .order('date'),
    supabase
      .from('vehicles')
      .select('id, label, plate')
      .eq('status', 'maintenance'),
    supabase
      .from('team_members')
      .select('id, full_name, end_date')
      .eq('contract_type', 'cdd')
      .eq('active', true)
      .gt('end_date', today)
      .lt('end_date', thirtyDaysAhead)
      .order('end_date'),
  ])

  return {
    overdueMaintenances: overdueMaintenances.data ?? [],
    oldInvoiced:         oldInvoiced.data ?? [],
    maintenanceVehicles: maintenanceVehicles.data ?? [],
    expiringContracts:   expiringContracts.data ?? [],
  }
}

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
