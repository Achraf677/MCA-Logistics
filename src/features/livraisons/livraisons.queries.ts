import { supabase } from '../../app/providers'
import { canTransition } from './livraisons.logic'
import type { ComputedAmount } from './livraisons.logic'
import type { DeliveryFilters, DeliveryInsert, DeliveryStatus } from './livraisons.types'

const WITH_JOINS = `
  *,
  clients!client_id(name, tariff_mode, tariff_rate_cts),
  vehicles!vehicle_id(label),
  team_members!driver_id(full_name)
`.trim()

export async function getDeliveries(filters: DeliveryFilters = {}) {
  let q = supabase
    .from('deliveries')
    .select(WITH_JOINS)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.status && filters.status !== 'all') q = q.eq('statut', filters.status)
  if (filters.client_id)  q = q.eq('client_id', filters.client_id)
  if (filters.vehicle_id) q = q.eq('vehicle_id', filters.vehicle_id)
  if (filters.driver_id)  q = q.eq('driver_id', filters.driver_id)
  if (filters.date_from)  q = q.gte('date', filters.date_from)
  if (filters.date_to)    q = q.lte('date', filters.date_to)

  return q
}

export async function createDelivery(data: DeliveryInsert) {
  return supabase.from('deliveries').insert(data).select(WITH_JOINS).single()
}

export async function updateDelivery(id: string, data: Partial<DeliveryInsert>) {
  return supabase.from('deliveries').update(data).eq('id', id).select(WITH_JOINS).single()
}

// Suppression (RLS : président uniquement, via deliveries_delete_president).
export async function deleteDelivery(id: string) {
  return supabase.from('deliveries').delete().eq('id', id)
}

/** Suppression multiple. Ne fait rien si `ids` est vide. Remonte l'erreur éventuelle. */
export async function deleteDeliveries(ids: string[]) {
  if (ids.length === 0) return { data: null, error: null }
  return supabase.from('deliveries').delete().in('id', ids)
}

/**
 * Orchestre une transition gardée.
 * - Vérifie canTransition() → erreur si saut illégal.
 * - Bloque livree→facturee si montant absent.
 * - Pose invoiced_at (→facturee) ou paid_at (→payee).
 * - À →facturee : tente Edge Function Pennylane, sinon sync_pending=true.
 */
export async function transitionDelivery(
  id: string,
  from: string,
  to: DeliveryStatus,
  amount?: ComputedAmount,
): Promise<{ data: unknown; error: Error | null }> {
  if (!canTransition(from, to)) {
    return { data: null, error: new Error(`Transition ${from} → ${to} interdite`) }
  }

  if (to === 'facturee' && (!amount || amount.amount_ht_cts <= 0)) {
    return { data: null, error: new Error('Montant requis avant de facturer') }
  }

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { statut: to }

  if (to === 'facturee' && amount) {
    updates.invoiced_at    = now
    updates.amount_ht_cts  = amount.amount_ht_cts
    updates.tva_cts        = amount.tva_cts
    updates.amount_ttc_cts = amount.amount_ttc_cts
    // montant_ttc_cts est GENERATED ALWAYS — ne jamais l'écrire.
    // montant_ht_cts a DEFAULT 0 depuis la migration — ne pas l'écrire non plus.
  }

  if (to === 'payee') {
    updates.paid_at = now
  }

  const { data, error } = await supabase
    .from('deliveries')
    .update(updates)
    .eq('id', id)
    .select(WITH_JOINS)
    .single()

  if (error) return { data: null, error: new Error(error.message) }

  // Push Pennylane uniquement à →facturee
  if (to === 'facturee') {
    const pushed = await tryPushPennylane(id)
    if (!pushed) {
      // Edge Function absente ou KO → sync_queue
      await supabase.from('deliveries').update({ sync_pending: true }).eq('id', id)
    }
  }

  return { data, error: null }
}

async function tryPushPennylane(deliveryId: string): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('pennylane-invoice', {
      body: { delivery_id: deliveryId },
    })
    return !error
  } catch {
    return false
  }
}

// ── Rattrapage Pennylane (resync des livraisons bloquées) ─────────────────────
// Une livraison passée `facturee` dont l'appel Pennylane a échoué reste
// sync_pending=true sans pennylane_invoice_id. pennylane-invoice étant idempotent
// et gérant lui-même sync_pending=false au succès, le resync = re-invoquer.

export async function getPendingSyncDeliveries() {
  return supabase
    .from('deliveries')
    .select('id')
    .eq('statut', 'facturee')
    .eq('sync_pending', true)
    .is('pennylane_invoice_id', null)
}

export async function resyncPending(): Promise<{ resynced: number; failed: number }> {
  const { data } = await getPendingSyncDeliveries()
  const ids = (data as { id: string }[] | null)?.map(d => d.id) ?? []

  let resynced = 0
  let failed = 0
  for (const id of ids) {
    try {
      const { error } = await supabase.functions.invoke('pennylane-invoice', {
        body: { delivery_id: id },
      })
      if (error) failed++
      else resynced++
    } catch {
      failed++
    }
  }
  return { resynced, failed }
}

// ── Clients actifs (pour les sélecteurs du drawer) ────────────────────────────
export async function getActiveClients() {
  return supabase
    .from('clients')
    .select('id, name, tariff_mode, tariff_rate_cts')
    .eq('active', true)
    .order('name')
}

// ── Véhicules actifs ──────────────────────────────────────────────────────────
export async function getActiveVehicles() {
  return supabase
    .from('vehicles')
    .select('id, label')
    .eq('status', 'active')
    .order('label')
}

// ── Chauffeurs actifs (rôle chauffeur uniquement) ─────────────────────────────
export async function getActiveDrivers() {
  return supabase
    .from('team_members')
    .select('id, full_name')
    .eq('active', true)
    .eq('role', 'chauffeur')
    .order('full_name')
}

// ── Preuve de livraison (POD) ─────────────────────────────────────────────────
export async function savePod(id: string, recipientName: string) {
  return supabase
    .from('deliveries')
    .update({
      pod_recipient_name: recipientName,
      pod_captured_at: new Date().toISOString(),
    })
    .eq('id', id)
}

// ── Export CSV ────────────────────────────────────────────────────────────────
export async function exportDeliveriesCSV(filters: DeliveryFilters = {}) {
  const { data } = await getDeliveries(filters)
  if (!data) return ''
  const headers = ['Date', 'Client', 'Véhicule', 'Chauffeur', 'HT (cts)', 'TVA (cts)', 'TTC (cts)', 'Statut', 'km']
  const rows = (data as unknown as Record<string, unknown>[]).map(d => [
    d.date,
    (d.clients as { name: string } | null)?.name ?? '',
    (d.vehicles as { label: string } | null)?.label ?? '',
    (d.team_members as { full_name: string } | null)?.full_name ?? '',
    (d.amount_ht_cts as number | null) ?? d.montant_ht_cts ?? '',
    d.tva_cts ?? '',
    (d.amount_ttc_cts as number | null) ?? d.montant_ttc_cts ?? '',
    d.statut,
    d.km ?? '',
  ])
  return [headers, ...rows].map(r => r.join(';')).join('\n')
}
