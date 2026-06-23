import { supabase } from '../../app/providers'

export async function getTvaData(dateFrom: string, dateTo: string) {
  const [deliveries, chargesRes, fuelRes] = await Promise.all([
    supabase.from('deliveries')
      .select('amount_ht_cts, amount_ttc_cts, tva_rate')
      .gte('date', dateFrom).lte('date', dateTo)
      .in('statut', ['facturee', 'payee']),
    supabase.from('charges')
      .select('id, montant_ht_cts, tva_rate, tva_cts, tva_pays')
      .gte('date', dateFrom).lte('date', dateTo),
    supabase.from('fuel_logs')
      .select('total_cts, tva_cts, tva_deductible_pct, tva_rate, charge_id')
      .gte('date', dateFrom).lte('date', dateTo),
  ])

  const fuelData = fuelRes.data ?? []
  const linkedChargeIds = new Set(
    fuelData.map(f => f.charge_id).filter((id): id is string => id != null)
  )

  const charges = (chargesRes.data ?? []).map(c => ({
    ...c,
    linkedToFuel: linkedChargeIds.has(c.id),
  }))

  return {
    deliveries: deliveries.data ?? [],
    charges,
    fuel: fuelData,
  }
}
