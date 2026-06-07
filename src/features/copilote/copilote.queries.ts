import { supabase } from '../../app/providers'
import type { DeliveryType, ExtractInput } from './copilote.types'

// ── B1 : extraction via Edge Function (lecture seule) ──────────────────────────
export async function extractDeliveries(input: ExtractInput) {
  return supabase.functions.invoke('ai-extract-deliveries', { body: input })
}

// ── B2 : référentiel clients pour le matching (lecture seule) ──────────────────
export interface ClientOption {
  id: string
  name: string
  type: DeliveryType | null
}

export async function listClients() {
  return supabase
    .from('clients')
    .select('id, name, type')
    .eq('active', true)
    .order('name')
    .returns<ClientOption[]>()
}

export interface DriverOption {
  id: string
  full_name: string
}

export async function listDrivers() {
  return supabase
    .from('team_members')
    .select('id, full_name')
    .eq('active', true)
    .order('full_name')
    .returns<DriverOption[]>()
}

export interface VehicleOption {
  id: string
  label: string
  plate: string | null
}

export async function listVehicles() {
  return supabase
    .from('vehicles')
    .select('id, label, plate')
    .order('label')
    .returns<VehicleOption[]>()
}

// ── B2 : création réelle (sur clic explicite uniquement) ───────────────────────
// Pas d'import cross-feature : queries minimales écrites ici, via le client
// supabase partagé. La RLS s'applique (filtrage par company_id côté base).

export interface NewClient {
  company_id: string
  name: string
  type: DeliveryType | null
}

/** Crée un client minimal (tariff_mode prend son défaut 'manuel' côté base). Renvoie l'id. */
export async function createClientRow(data: NewClient) {
  return supabase.from('clients').insert(data).select('id').single()
}

export interface NewDelivery {
  company_id: string
  client_id: string
  driver_id: string | null
  vehicle_id: string | null
  date: string
  type: DeliveryType | null
  pickup_address: string | null
  delivery_address: string | null
  km: number | null
  weight_kg: number | null
  /** Montant HT en centimes (= euros × 100). montant_ttc_cts est GÉNÉRÉ : jamais écrit. */
  montant_ht_cts: number
  tva_rate: number
  statut: string
  notes: string | null
}

/**
 * Crée une livraison en écrivant UNIQUEMENT les colonnes amount_* (source de vérité).
 * À partir du montant HT saisi + tva_rate :
 *   tva_cts = round(montant_ht × tva_rate / 100), amount_ht_cts = montant_ht,
 *   amount_ttc_cts = montant_ht + tva_cts.
 * Les colonnes legacy montant_* (générées/legacy) ne sont JAMAIS écrites.
 */
export async function createDeliveryRow(data: NewDelivery) {
  const { montant_ht_cts, ...rest } = data
  const tva_cts = Math.round((montant_ht_cts * data.tva_rate) / 100)
  const row = {
    ...rest,
    amount_ht_cts: montant_ht_cts,
    tva_cts,
    amount_ttc_cts: montant_ht_cts + tva_cts,
  }
  return supabase.from('deliveries').insert(row).select('id').single()
}
