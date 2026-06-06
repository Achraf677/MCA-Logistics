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

/** Crée une livraison. N'écrit ni montant_ttc_cts (généré) ni les colonnes legacy amount_*. */
export async function createDeliveryRow(data: NewDelivery) {
  return supabase.from('deliveries').insert(data).select('id').single()
}
