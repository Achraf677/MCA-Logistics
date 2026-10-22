import { supabase } from '../../app/providers'
import type { DocumentRow } from '../../shared/lib/documents.types'
import type { MaFiche } from './mescourses.types'

// ── Espace salarié (Ma journée, Dépenses, Moi) ───────────────────────────────

const COLS_FICHE_BASE = 'id, full_name, licence_b_expiry, medical_visit_expiry, phone, email'
const COLS_FICHE_JOURNEE = `${COLS_FICHE_BASE}, tarif_domicile_cts, tarif_relais_cts, clients_messagerie`

/**
 * Fiche complète du compte connecté (espace salarié). Si les colonnes de la journée de
 * colis manquent encore en base, on relit sans elles : « Moi » reste utilisable, et
 * « Ma journée » sait dire pourquoi elle est vide (`complete = false`).
 * `data: null` sans erreur = compte non relié à une fiche.
 */
export async function getMaFicheComplete(profileId: string): Promise<{ data: MaFiche | null; error: Error | null }> {
  const pleine = await supabase.from('team_members').select(COLS_FICHE_JOURNEE)
    .eq('profile_id', profileId).limit(1).maybeSingle()
  if (!pleine.error) {
    const d = pleine.data as Omit<MaFiche, 'complete'> | null
    return { data: d ? { ...d, clients_messagerie: d.clients_messagerie ?? [], complete: true } : null, error: null }
  }
  const base = await supabase.from('team_members').select(COLS_FICHE_BASE)
    .eq('profile_id', profileId).limit(1).maybeSingle()
  if (base.error) return { data: null, error: new Error(base.error.message) }
  const d = base.data as Pick<MaFiche, 'id' | 'full_name' | 'phone' | 'email' | 'licence_b_expiry' | 'medical_visit_expiry'> | null
  return {
    data: d ? { ...d, tarif_domicile_cts: null, tarif_relais_cts: null, clients_messagerie: [], complete: false } : null,
    error: null,
  }
}

/** Documents de SA fiche (permis, visite médicale…) : RLS `documents_salarie_siens`. */
export async function getDocumentsDeMaFiche(memberId: string) {
  const { data, error } = await supabase.from('documents').select('*')
    .eq('entity_type', 'team_member').eq('entity_id', memberId).order('created_at', { ascending: false })
  return { data: (data ?? []) as DocumentRow[], error: error ? new Error(error.message) : null }
}
