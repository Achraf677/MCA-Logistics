import { supabase } from '../../app/providers'
import { lireErreurEdge } from '../../shared/lib/erreurEdge'
import { uploadDocument } from '../../shared/lib/documents.queries'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { TYPES_DOCUMENT } from '../../shared/lib/documentsTri'

/** Tous les documents de la société, plus récents d'abord (RLS). */
export async function listerDocuments(limite = 3000) {
  return supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(limite).returns<DocumentRow[]>()
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

/**
 * Applique le classement confirmé : le fichier part dans le Drive (<dossier de rangement>/<Dossier>/<Année>/<nom>), puis le
 * document est noté « classé ». Sans Drive ou en cas d'échec, rien ne change (le document reste à confirmer).
 */
export async function confirmerClassement(id: string, c: ClassementConfirme): Promise<{ error: { message: string } | null }> {
  const dossier = TYPES_DOCUMENT.find(t => t.cle === c.type)?.dossier ?? 'Autre'
  const { data, error: errEdge } = await supabase.functions.invoke('drive-ranger', { body: { id, nom: c.nom, dossier, annee: c.date?.slice(0, 4) ?? null } })
  if (errEdge || !data?.ok) {
    const echec = await lireErreurEdge(data, errEdge)
    const brut = echec?.message ?? ''
    return { error: { message: brut.includes('drive_not_connected') ? 'Google Drive n\'est pas connecté (Paramètres).' : brut.includes('drive_access_denied') ? 'Tu n\'as pas accès au Drive.' : brut || 'Envoi vers le Drive impossible' } }
  }
  const { error } = await supabase.from('documents').update({
    file_name: c.nom, type_document: c.type, date_document: c.date, tiers: c.tiers, reference: c.reference,
    montant_ttc_cts: c.montant_ttc_cts, resume: c.resume, statut_tri: 'classe', proposition: null, trie_le: new Date().toISOString(),
  }).eq('id', id).select('id')
  return { error }
}

/** Renvoie un document dans l'Inbox (proposition rejetée, ou reclassement d'un document rangé). */
export async function remettreDansInbox(id: string) {
  return supabase.from('documents').update({ statut_tri: 'a_trier', proposition: null, trie_le: null }).eq('id', id).select('id')
}

// ── Google Drive (Bibliothèque) ─────────────────────────────────────────────

export interface StatutDrive { connecte: boolean; drive: boolean; email: string | null }

/** Le compte Google est-il branché, et le scope Drive accordé ? */
export async function statutDrive(): Promise<StatutDrive> {
  const { data } = await supabase.functions.invoke('drive-status')
  return { connecte: !!data?.connected, drive: !!data?.drive, email: data?.email ?? null }
}

export interface FichierDrive {
  id: string
  name: string
  mimeType: string
  webViewLink?: string
  modifiedTime?: string
  size?: string
}

export interface ContenuDrive { folder_id: string; racine_id: string | null; folders: FichierDrive[]; files: FichierDrive[] }

export const DOSSIER_DRIVE = 'application/vnd.google-apps.folder'

/** Contenu d'un dossier du Drive, ou résultats d'une recherche par nom dans tout le Drive. */
export async function parcourirDrive(opts: { dossierId?: string; recherche?: string; definirRacine?: boolean } = {}): Promise<{ contenu: ContenuDrive | null; erreur: string | null }> {
  const { data, error } = await supabase.functions.invoke('drive-browse', {
    body: { folder_id: opts.dossierId ?? 'root', recherche: opts.recherche ?? '', definir_racine: opts.definirRacine === true },
  })
  if (error || !data?.ok) {
    const echec = await lireErreurEdge(data, error)
    const m = echec?.message ?? ''
    return { contenu: null, erreur: m.includes('drive_not_connected') ? 'non_connecte' : m.includes('drive_access_denied') ? 'Tu n\'as pas accès au Drive.' : m || 'Lecture du Drive impossible' }
  }
  return { contenu: data as ContenuDrive, erreur: null }
}

/** Télécharge un fichier du Drive pour l'afficher dans l'appli (Docs / Sheets exportés en PDF). */
export async function lireFichierDrive(f: FichierDrive): Promise<{ url: string; type: 'image' | 'pdf' } | null> {
  const natif = f.mimeType.startsWith('application/vnd.google-apps.')
  const type = natif || f.mimeType === 'application/pdf' ? 'pdf' : f.mimeType.startsWith('image/') ? 'image' : null
  if (!type) return null
  const { data, error } = await supabase.functions.invoke('drive-fichier', { body: { file_id: f.id } })
  if (error || !(data instanceof Blob)) return null
  return { url: URL.createObjectURL(new Blob([data], { type: type === 'pdf' ? 'application/pdf' : f.mimeType })), type }
}

export async function renommerDansDrive(fileId: string, nom: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('drive-rename', { body: { file_id: fileId, name: nom } })
  if (error || !data?.ok) return (await lireErreurEdge(data, error))?.message ?? 'Renommage impossible'
  return null
}
