import { supabase } from '../../app/providers'
import type { Tour, TourDelivery, TourStatus } from './tournees.types'

// ── Société / dépôt ───────────────────────────────────────────────────────────
// (feature étanche : on ne ré-importe pas les queries d'autres features)

export async function getCompanyDepot(companyId: string) {
  return supabase
    .from('companies')
    .select('id, name, depot_lat, depot_lng')
    .eq('id', companyId)
    .single()
}

// ── Référentiels ──────────────────────────────────────────────────────────────

export async function getActiveVehicles() {
  return supabase
    .from('vehicles')
    .select('id, label')
    .eq('status', 'active')
    .order('label')
}

export async function getActiveDrivers() {
  return supabase
    .from('team_members')
    .select('id, full_name')
    .eq('active', true)
    .eq('role', 'chauffeur')
    .order('full_name')
}

// ── Livraisons d'une journée (statuts éligibles) ──────────────────────────────

const DELIVERY_COLS =
  'id, date, statut, description, delivery_address, delivery_lat, delivery_lng, tour_id, stop_order, arrival_time, clients!client_id(name)'

export async function getDeliveriesForDate(companyId: string, date: string) {
  return supabase
    .from('deliveries')
    .select(DELIVERY_COLS)
    .eq('company_id', companyId)
    .eq('date', date)
    .in('statut', ['planifiee', 'en_cours', 'livree'])
    .order('stop_order', { ascending: true, nullsFirst: false })
}

/** Arrêts d'une tournée, ordonnés (après optimisation). */
export async function getTourStops(tourId: string) {
  return supabase
    .from('deliveries')
    .select(DELIVERY_COLS)
    .eq('tour_id', tourId)
    .order('stop_order', { ascending: true, nullsFirst: false })
}

// ── Tournées ──────────────────────────────────────────────────────────────────

/** Cherche la tournée d'un (véhicule, date). null si absente. */
export async function findTour(companyId: string, date: string, vehicleId: string) {
  return supabase
    .from('tours')
    .select('*')
    .eq('company_id', companyId)
    .eq('date', date)
    .eq('vehicle_id', vehicleId)
    .maybeSingle()
}

export async function getTour(tourId: string) {
  return supabase.from('tours').select('*').eq('id', tourId).single()
}

export async function createTour(data: {
  company_id: string
  date: string
  vehicle_id: string
  driver_id: string | null
  status: TourStatus
  depot_lat: number | null
  depot_lng: number | null
}) {
  return supabase.from('tours').insert(data).select().single()
}

export async function updateTour(id: string, data: Partial<Tour>) {
  return supabase.from('tours').update(data).eq('id', id).select().single()
}

// ── Assignation des livraisons à une tournée ──────────────────────────────────

/** Assigne une liste de livraisons à une tournée. No-op si liste vide. */
export async function assignDeliveries(ids: string[], tourId: string) {
  if (ids.length === 0) return { error: null }
  return supabase.from('deliveries').update({ tour_id: tourId }).in('id', ids)
}

/** Détache des livraisons (tour_id, stop_order, arrival_time remis à null). No-op si vide. */
export async function unassignDeliveries(ids: string[]) {
  if (ids.length === 0) return { error: null }
  return supabase
    .from('deliveries')
    .update({ tour_id: null, stop_order: null, arrival_time: null })
    .in('id', ids)
}

// ── Optimisation (Edge Function ORS) ──────────────────────────────────────────

export async function optimizeTour(tourId: string) {
  return supabase.functions.invoke('optimize-tour', { body: { tour_id: tourId } })
}

export type { TourDelivery }
