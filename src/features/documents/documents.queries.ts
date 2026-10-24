import { supabase } from '../../app/providers'
import { lireErreurEdge } from '../../shared/lib/erreurEdge'
import { uploadDocument } from '../../shared/lib/documents.queries'
import type { DocumentRow } from '../../shared/lib/documents.types'
import type { LigneBibliotheque } from './documents.logic'
import { libelleSource } from './documents.logic'

/** Tous les documents de la société, plus récents d'abord (RLS). */
export async function listerDocuments(limite = 3000) {
  return supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(limite).returns<DocumentRow[]>()
}

/** Justificatifs de dépense (Finance) : lus ici en lecture seule, pour que la bibliothèque contienne TOUT. */
export async function listerJustificatifsPourBibliotheque(): Promise<LigneBibliotheque[]> {
  const { data } = await supabase.from('receipts_inbox')
    .select('id, file_name, mime_type, storage_path, size_bytes, note, categorie, montant_ttc_cts, date_depense, created_at')
    .order('created_at', { ascending: false }).limit(1000)
  return ((data ?? []) as Array<{
    id: string; file_name: string; mime_type: string | null; storage_path: string; size_bytes: number | null
    note: string | null; montant_ttc_cts: number | null; date_depense: string | null; created_at: string
  }>).map(t => ({
    id: t.id, origine: 'justificatif' as const, nom: t.note ? `${t.note} — ${t.file_name}` : t.file_name, mime: t.mime_type, chemin: t.storage_path,
    taille: t.size_bytes, type: 'ticket', date: t.date_depense, tiers: null, montantCts: t.montant_ttc_cts,
    source: libelleSource('justificatif'), creeLe: t.created_at,
  }))
}

/** Dépose des fichiers dans l'Inbox (entité « dépôt »). Renvoie le nombre déposé et les échecs. */
export async function deposerDansInbox(fichiers: File[], companyId: string, onAvance?: (fait: number, total: number) => void) {
  let ok = 0
  const echecs: string[] = []
  for (let i = 0; i < fichiers.length; i++) {
    const { error } = await uploadDocument(fichiers[i], companyId, { entity_type: 'depot' })
    if (error) echecs.push(`${fichiers[i].name} : ${error.message}`)
    else ok++
    onAvance?.(i + 1, fichiers.length)
  }
  return { ok, echecs }
}

export interface ResultatTri { id: string; ok: boolean; raison?: string }

/** Demande à l'IA de lire un lot de documents (Edge `trier-documents`, 6 au plus). Rien n'est appliqué : propositions à confirmer. */
export async function lancerTri(ids: string[]): Promise<{ resultats: ResultatTri[]; erreur: string | null }> {
  const { data, error } = await supabase.functions.invoke('trier-documents', { body: { ids } })
  if (error || !data?.ok) {
    const echec = await lireErreurEdge(data, error)
    return { resultats: ids.map(id => ({ id, ok: false, raison: echec?.message ?? 'tri impossible' })), erreur: echec?.message ?? 'tri impossible' }
  }
  return { resultats: (data.data?.resultats ?? []) as ResultatTri[], erreur: null }
}

export interface ClassementConfirme {
  nom: string
  type: string | null
  date: string | null
  tiers: string | null
  reference: string | null
  montant_ttc_cts: number | null
  resume: string | null
}

/** Applique le classement confirmé : le document est renommé et rangé (la proposition est effacée). */
export async function confirmerClassement(id: string, c: ClassementConfirme) {
  return supabase.from('documents').update({
    file_name: c.nom, type_document: c.type, date_document: c.date, tiers: c.tiers, reference: c.reference,
    montant_ttc_cts: c.montant_ttc_cts, resume: c.resume, statut_tri: 'classe', proposition: null, trie_le: new Date().toISOString(),
  }).eq('id', id).select('id')
}

/** Renvoie un document dans l'Inbox (proposition rejetée, ou reclassement d'un document rangé). */
export async function remettreDansInbox(id: string) {
  return supabase.from('documents').update({ statut_tri: 'a_trier', proposition: null, trie_le: null }).eq('id', id).select('id')
}

export async function renommerDocument(id: string, nom: string) {
  return supabase.from('documents').update({ file_name: nom }).eq('id', id).select('id')
}
