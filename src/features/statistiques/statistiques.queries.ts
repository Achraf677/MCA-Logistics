import { supabase } from '../../app/providers'

export async function getStatistiquesData() {
  const now = new Date()
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
  const yearEnd   = new Date(now.getFullYear(), 11, 31).toISOString().slice(0, 10)

  const [deliveries, charges, fuel, maintenances] = await Promise.all([
    supabase
      .from('deliveries')
      .select('date, amount_ht_cts, statut, client_id, clients!client_id(name)')
      .gte('date', yearStart)
      .lte('date', yearEnd)
      .neq('statut', 'annulee'),
    supabase
      .from('charges')
      .select('date, montant_ht_cts, charge_categories!category_id(name, slug, type)')
      .gte('date', yearStart)
      .lte('date', yearEnd)
      .eq('est_immobilisation', false),
    supabase
      .from('fuel_logs')
      .select('date, total_cts, liters')
      .gte('date', yearStart)
      .lte('date', yearEnd),
    supabase
      .from('vehicle_maintenances')
      .select('date, cost_cts, vehicles!vehicle_id(label)')
      .gte('date', yearStart)
      .lte('date', yearEnd),
  ])

  return {
    deliveries: deliveries.data ?? [],
    charges: charges.data ?? [],
    fuel: fuel.data ?? [],
    maintenances: maintenances.data ?? [],
    year: now.getFullYear(),
  }
}
