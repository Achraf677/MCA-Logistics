import { supabase } from '../../app/providers'
import type { DraftType } from './brouillons.types'

// Déclenchement Edge Function — aucun appel API externe direct, aucune écriture base.

export async function generateDraft(prompt: string, type: DraftType) {
  return supabase.functions.invoke('brouillons-generate', { body: { prompt, type } })
}
