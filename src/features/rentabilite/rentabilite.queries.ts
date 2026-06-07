import { supabase } from '../../app/providers'

export async function getRentabiliteData(year: number) {
  const start = `${year}-01-01`
  const end   = `${year}-12-31`

  const [deliveries, charges, fuel, maintenances] = await Promise.all([
    supabase.from('deliveries')
      .select('date, amount_ht_cts, tva_rate, statut')
      .gte('date', start).lte('date', end).neq('statut', 'annulee'),
    supabase.from('charges')
      .select('date, montant_ht_cts, tva_cts')
      .gte('date', start).lte('date', end),
    supabase.from('fuel_logs')
      .select('date, total_cts')
      .gte('date', start).lte('date', end),
    supabase.from('vehicle_maintenances')
      .select('date, cost_cts')
      .gte('date', start).lte('date', end),
  ])

  return {
    deliveries: deliveries.data ?? [],
    charges:    charges.data ?? [],
    fuel:       fuel.data ?? [],
    maintenances: maintenances.data ?? [],
    year,
  }
}
