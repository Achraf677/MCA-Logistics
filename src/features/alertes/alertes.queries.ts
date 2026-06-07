import { supabase } from '../../app/providers'

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
      .select('id, date, amount_ttc_cts, montant_ttc_cts, clients!client_id(name)')
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
