import { supabase } from '../../app/providers'
import type { DeliveryRow } from '../livraisons/livraisons.types'

export async function getDeliveriesForWeek(dateFrom: string, dateTo: string) {
  return supabase
    .from('deliveries')
    .select('*, clients!client_id(name), vehicles!vehicle_id(label), team_members!driver_id(full_name)')
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .neq('statut', 'annulee')
    // Relevés de messagerie et forfaits : rien à faire sur la route.
    .or('prestation.is.null,prestation.not.in.(messagerie,forfait)')
    .order('date', { ascending: true })
    .order('created_at', { ascending: true })
    .returns<DeliveryRow[]>()
}
