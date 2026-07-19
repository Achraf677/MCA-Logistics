import { supabase } from '../../app/providers'
import type { Tour, TourDelivery, TourStatus } from './tournees.types'
import type { Assignment, DispatchData } from './tournees.types'

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
  'id, date, statut, description, delivery_address, delivery_lat, delivery_lng, tour_id, stop_order, arrival_time, delivered_at, clients!client_id(name)'

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

// ── Suivi : marquer un arrêt livré ────────────────────────────────────────────
// La garde de transition (canTransition) est vérifiée côté appelant via
// livraisons.logic.ts (machine d'états unique, pas de duplication).

export async function markDelivered(deliveryId: string, when: string) {
  return supabase
    .from('deliveries')
    .update({ statut: 'livree', delivered_at: when })
    .eq('id', deliveryId)
}

// ── Cycle de vie de la tournée ────────────────────────────────────────────────

export async function setTourStatus(tourId: string, status: TourStatus) {
  return supabase.from('tours').update({ status }).eq('id', tourId).select().single()
}

// ── Optimisation (Edge Function ORS) ──────────────────────────────────────────

export async function optimizeTour(tourId: string) {
  return supabase.functions.invoke('optimize-tour', { body: { tour_id: tourId } })
}

// ── Multi-véhicule (dispatch + optimisation) ──────────────────────────────────

/** Tente de lire le corps JSON d'une erreur HTTP de Function (ex. 409 / 422).
 *  Priorité : data.message (payload structuré) → message (top-level) → error.
 *  Retourne null si le corps est illisible ou vide, laissant l'appelant retomber
 *  sur error.message ("Edge Function returned a non-2xx status code", générique). */
async function readFunctionErrorMessage(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown } | null)?.context
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      const body = await (ctx as Response).json()
      return body?.data?.message ?? body?.message ?? body?.error ?? null
    } catch {
      // corps illisible : on retombera sur error.message
    }
  }
  return null
}

/**
 * Dispatch multi-véhicule : invoque optimize-tours.
 * Retourne `data` si ok. Sinon throw Error(message) — remonte data.message
 * (notamment sur 409 : une tournée de ces véhicules est déjà en_cours/terminee).
 */
export async function dispatchAndOptimize(
  date: string,
  assignments: Assignment[],
  deliveryIds: string[],
): Promise<DispatchData> {
  const { data, error } = await supabase.functions.invoke('optimize-tours', {
    body: { date, assignments, delivery_ids: deliveryIds },
  })

  if (error) {
    const msg = await readFunctionErrorMessage(error)
    throw new Error(msg ?? error.message)
  }

  const res = data as { ok?: boolean; data?: DispatchData & { message?: string }; error?: string; message?: string }
  if (!res?.ok) {
    throw new Error(res?.data?.message ?? res?.message ?? res?.error ?? 'Optimisation multi-véhicule échouée')
  }
  return res.data as DispatchData
}

/** Toutes les tournées d'une date (ordre stable par création). */
export async function fetchToursByDate(companyId: string, date: string) {
  return supabase
    .from('tours')
    .select('*')
    .eq('company_id', companyId)
    .eq('date', date)
    .order('created_at', { ascending: true })
}

/** Pool sélectionnable : livraisons 'planifiee' de la date (même projection que TourDelivery). */
export async function fetchPlannableDeliveries(companyId: string, date: string) {
  return supabase
    .from('deliveries')
    .select(DELIVERY_COLS)
    .eq('company_id', companyId)
    .eq('date', date)
    .eq('statut', 'planifiee')
    .order('created_at', { ascending: true })
}

export type { TourDelivery }
