import { supabase } from '../../app/providers'

export async function getTvaData(dateFrom: string, dateTo: string) {
  const [deliveries, charges, fuel] = await Promise.all([
    supabase.from('deliveries')
      .select('montant_ht_cts, tva_rate, montant_ttc_cts')
      .gte('date', dateFrom).lte('date', dateTo)
      .in('statut', ['facturee', 'payee']),
    supabase.from('charges')
      .select('montant_ht_cts, tva_rate, tva_cts')
      .gte('date', dateFrom).lte('date', dateTo),
    supabase.from('fuel_logs')
      .select('total_cts, tva_cts, tva_deductible_pct')
      .gte('date', dateFrom).lte('date', dateTo),
  ])

  return {
    deliveries: deliveries.data ?? [],
    charges:    charges.data ?? [],
    fuel:       fuel.data ?? [],
  }
}
