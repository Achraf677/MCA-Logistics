import { supabase } from '../../app/providers'
import type { DeliveryTemplate } from './modeles.types'

// Lecture de tous les modèles (avec nom du client joint pour l'affichage liste).
export async function listTemplates(): Promise<{ data: DeliveryTemplate[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from('delivery_templates')
    .select(`
      id, company_id, label, client_id, description,
      pickup_address, delivery_address, amount_ht_cts, tva_rate,
      type, weight_kg, km, empty_km, vehicle_id, driver_id,
      created_at, updated_at,
      clients!client_id(name)
    `)
    .order('label')

  return { data: data as unknown as DeliveryTemplate[] | null, error }
}

// Création — n'écrit QUE amount_ht_cts (jamais montant_*).
export async function createTemplate(payload: Omit<DeliveryTemplate, 'id' | 'created_at' | 'updated_at' | 'clients'>) {
  return supabase.from('delivery_templates').insert(payload).select().single()
}

export async function updateTemplate(id: string, payload: Partial<Omit<DeliveryTemplate, 'id' | 'created_at' | 'updated_at' | 'clients'>>) {
  return supabase.from('delivery_templates').update(payload).eq('id', id).select().single()
}

export async function deleteTemplate(id: string) {
  return supabase.from('delivery_templates').delete().eq('id', id)
}

// ── Selects légers pour le formulaire ──────────────────────────────────────────

export async function listClientsLight(): Promise<{ data: { id: string; name: string }[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name')
    .eq('active', true)
    .order('name')
  return { data, error }
}

export async function listVehiclesLight(): Promise<{ data: { id: string; label: string }[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('id, label')
    .order('label')
  return { data, error }
}

export async function listDriversLight(): Promise<{ data: { id: string; full_name: string }[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from('team_members')
    .select('id, full_name')
    .eq('active', true)
    .order('full_name')
  return { data, error }
}
