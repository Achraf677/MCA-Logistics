import { supabase } from '../../app/providers'
import { effectiveHtCts } from '../../shared/lib/money'
import type { DeliveryRow } from '../livraisons/livraisons.types'

export interface DashboardKpis {
  caHtCts: number
  nbLivraisons: number
  factureePct: number
  payeePct: number
  vehiculesActifs: number
  chauffeurs: number
  clientsActifs: number
}

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

  const [deliveriesRes, vehiclesRes, teamRes, clientsRes] = await Promise.all([
    supabase
      .from('deliveries')
      .select('amount_ht_cts, statut')
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .neq('statut', 'annulee'),
    supabase.from('vehicles').select('id', { count: 'exact' }).eq('status', 'active').limit(1),
    supabase.from('team_members').select('id', { count: 'exact' }).eq('active', true).limit(1),
    supabase.from('clients').select('id', { count: 'exact' }).eq('active', true).limit(1),
  ])

  const deliveries = deliveriesRes.data ?? []
  const nb = deliveries.length
  const caHtCts = deliveries.reduce((s, d) => s + effectiveHtCts(d), 0)
  const nbFacturee = deliveries.filter(d => d.statut === 'facturee' || d.statut === 'payee').length
  const nbPayee = deliveries.filter(d => d.statut === 'payee').length

  return {
    caHtCts,
    nbLivraisons: nb,
    factureePct: nb ? Math.round((nbFacturee / nb) * 100) : 0,
    payeePct: nb ? Math.round((nbPayee / nb) * 100) : 0,
    vehiculesActifs: vehiclesRes.count ?? 0,
    chauffeurs: teamRes.count ?? 0,
    clientsActifs: clientsRes.count ?? 0,
  }
}

export async function getRecentDeliveries() {
  return supabase
    .from('deliveries')
    .select('*, clients!client_id(name), vehicles!vehicle_id(label), team_members!driver_id(full_name)')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(8)
    .returns<DeliveryRow[]>()
}

export async function getMonthlyTrend() {
  const results: { month: string; caHtCts: number; nb: number }[] = []
  const now = new Date()

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const start = d.toISOString().slice(0, 10)
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
    const label = d.toLocaleDateString('fr-FR', { month: 'short' })

    const { data } = await supabase
      .from('deliveries')
      .select('amount_ht_cts')
      .gte('date', start)
      .lte('date', end)
      .neq('statut', 'annulee')

    results.push({
      month: label,
      caHtCts: (data ?? []).reduce((s, d) => s + effectiveHtCts(d), 0),
      nb: (data ?? []).length,
    })
  }

  return results
}
