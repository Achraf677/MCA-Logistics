import { supabase } from '../../app/providers'
import type { ExtractInput } from './copilote.types'

// Déclenchement Edge Function — aucun appel API externe direct, aucune écriture base (B1 lecture seule).

export async function extractDeliveries(input: ExtractInput) {
  return supabase.functions.invoke('ai-extract-deliveries', { body: input })
}
