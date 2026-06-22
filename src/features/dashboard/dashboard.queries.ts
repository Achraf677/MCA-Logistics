import { supabase } from '../../app/providers'
import { effectiveHtCts } from '../../shared/lib/money'
import type { DeliveryRow } from '../livraisons/livraisons.types'

export interface DashboardKpis {
  caHtCts: number
  nbLivraisons: number
  nbFacturee: number
  nbPayee: number
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
    nbFacturee,
    nbPayee,
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

export type TrendPeriod = '6m' | '12m' | 'ytd'

export async function getMonthlyTrend(period: TrendPeriod = '6m') {
  const now = new Date()

  // Construire la liste des mois à interroger
  let slots: { start: string; end: string; label: string }[]

  if (period === 'ytd') {
    const currentMonth = now.getMonth() // 0-based
    slots = Array.from({ length: currentMonth + 1 }, (_, i) => {
      const d = new Date(now.getFullYear(), i, 1)
      return {
        start: d.toISOString().slice(0, 10),
        end: new Date(now.getFullYear(), i + 1, 0).toISOString().slice(0, 10),
        label: d.toLocaleDateString('fr-FR', { month: 'short' }),
      }
    })
  } else {
    const count = period === '12m' ? 12 : 6
    slots = Array.from({ length: count }, (_, i) => {
      const offset = count - 1 - i
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1)
      return {
        start: d.toISOString().slice(0, 10),
        end: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10),
        label: d.toLocaleDateString('fr-FR', { month: 'short' }),
      }
    })
  }

  // Requêtes parallèles (vs séquentielles avant)
  return Promise.all(slots.map(async ({ start, end, label }) => {
    const { data } = await supabase
      .from('deliveries')
      .select('amount_ht_cts, statut')
      .gte('date', start)
      .lte('date', end)
      .neq('statut', 'annulee')
    const rows = data ?? []
    return {
      month: label,
      caHtCts: rows.reduce((s, d) => s + effectiveHtCts(d), 0),
      nb: rows.length,
      nbFacturee: rows.filter(d => d.statut === 'facturee' || d.statut === 'payee').length,
      nbPayee: rows.filter(d => d.statut === 'payee').length,
    }
  }))
}
