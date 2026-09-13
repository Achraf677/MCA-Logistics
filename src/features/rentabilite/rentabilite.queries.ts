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
      .gte('date', start).lte('date', end)
      .eq('est_immobilisation', false),
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

/**
 * Données du coût de revient par chargement (véhicule × jour).
 *
 * Requête distincte de `getRentabiliteData` : celle-ci a besoin du
 * `vehicle_id` et des kilomètres, dont la vue mensuelle n'a que faire. Les
 * charger pour tout le monde alourdirait un écran qui ne s'en sert pas.
 */
export async function getChargementsData(year: number) {
  const start = `${year}-01-01`
  const end   = `${year}-12-31`

  const [courses, pleins, entretiens, vehicules] = await Promise.all([
    supabase.from('deliveries')
      .select('date, vehicle_id, tour_id, amount_ht_cts, km, empty_km')
      .gte('date', start).lte('date', end).neq('statut', 'annulee'),
    supabase.from('fuel_logs')
      .select('total_cts')
      .gte('date', start).lte('date', end),
    supabase.from('vehicle_maintenances')
      .select('cost_cts')
      .gte('date', start).lte('date', end),
    supabase.from('vehicles').select('id, label'),
  ])

  return {
    courses:    courses.data ?? [],
    pleins:     pleins.data ?? [],
    entretiens: entretiens.data ?? [],
    vehicules:  (vehicules.data ?? []) as { id: string; label: string }[],
  }
}
