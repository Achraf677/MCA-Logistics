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

export interface ActionItems {
  facturesImpayees: number
  montantImpayeCts: number
  chargesNonCategorisees: number
  carburantARapprocher: number
  entretienARapprocher: number
  entretienAVenir: number
}

export async function getActionItems(): Promise<ActionItems> {
  const today = new Date().toISOString().slice(0, 10)

  // Vague 1 : requêtes indépendantes en parallèle
  const [
    impayeesRes,
    nonCatRes,
    carburantCatsRes,
    entretienCatsRes,
    fuelLinkedRes,
    maintLinkedRes,
    aVenirRes,
  ] = await Promise.all([
    supabase.from('deliveries').select('amount_ht_cts').eq('statut', 'facturee'),
    supabase.from('charges').select('id', { count: 'exact', head: true }).is('category_id', null),
    supabase.from('charge_categories').select('id').eq('type', 'carburant'),
    supabase.from('charge_categories').select('id').eq('type', 'entretien'),
    supabase.from('fuel_logs').select('charge_id').not('charge_id', 'is', null),
    supabase.from('vehicle_maintenances').select('charge_id').not('charge_id', 'is', null),
    supabase.from('vehicle_maintenances')
      .select('id', { count: 'exact', head: true })
      .not('next_due_date', 'is', null)
      .gte('next_due_date', today),
  ])

  const impayees        = impayeesRes.data ?? []
  const carburantCatIds = (carburantCatsRes.data ?? []).map(c => c.id)
  const entretienCatIds = (entretienCatsRes.data ?? []).map(c => c.id)
  const fuelLinkedIds   = new Set((fuelLinkedRes.data ?? []).map(r => r.charge_id).filter(Boolean))
  const maintLinkedIds  = new Set((maintLinkedRes.data ?? []).map(r => r.charge_id).filter(Boolean))

  // Vague 2 : charges par catégorie (dépend des catIds)
  const [carburantChargesRes, entretienChargesRes] = await Promise.all([
    carburantCatIds.length
      ? supabase.from('charges').select('id').in('category_id', carburantCatIds)
      : Promise.resolve({ data: [] as { id: string }[] }),
    entretienCatIds.length
      ? supabase.from('charges').select('id').in('category_id', entretienCatIds)
      : Promise.resolve({ data: [] as { id: string }[] }),
  ])

  return {
    facturesImpayees:       impayees.length,
    montantImpayeCts:       impayees.reduce((s, d) => s + (d.amount_ht_cts ?? 0), 0),
    chargesNonCategorisees: nonCatRes.count ?? 0,
    carburantARapprocher:   (carburantChargesRes.data ?? []).filter(c => !fuelLinkedIds.has(c.id)).length,
    entretienARapprocher:   (entretienChargesRes.data ?? []).filter(c => !maintLinkedIds.has(c.id)).length,
    entretienAVenir:        aVenirRes.count ?? 0,
  }
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

  // Requêtes parallèles par slot : livraisons + charges simultanées
  return Promise.all(slots.map(async ({ start, end, label }) => {
    const [delivRes, chargesRes] = await Promise.all([
      supabase
        .from('deliveries')
        .select('amount_ht_cts, statut')
        .gte('date', start)
        .lte('date', end)
        .neq('statut', 'annulee'),
      supabase
        .from('charges')
        .select('montant_ht_cts')
        .gte('date', start)
        .lte('date', end),
    ])
    const rows = delivRes.data ?? []
    const caHtCts = rows.reduce((s, d) => s + effectiveHtCts(d), 0)
    const chargesHtCts = (chargesRes.data ?? []).reduce((s, c) => s + (c.montant_ht_cts ?? 0), 0)
    return {
      month: label,
      caHtCts,
      chargesHtCts,
      margeHtCts: caHtCts - chargesHtCts,
      nb: rows.length,
      nbFacturee: rows.filter(d => d.statut === 'facturee' || d.statut === 'payee').length,
      nbPayee: rows.filter(d => d.statut === 'payee').length,
    }
  }))
}
