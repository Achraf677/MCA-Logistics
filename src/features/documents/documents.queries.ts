import { supabase } from '../../app/providers'
import { lireErreurEdge } from '../../shared/lib/erreurEdge'
import { getDownloadUrl, uploadDocument } from '../../shared/lib/documents.queries'
import type { DocumentRow, PropositionDocument } from '../../shared/lib/documents.types'
import { cheminsDepuisDossiers, type DossierDrive } from './documents.logic'
import type { Referents } from './decrire.logic'
import type { Annuaire } from '../../shared/lib/conventionDocuments'

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
  /** Dossier du Drive où ranger le fichier (de la racine de rangement au dossier final). */
  chemin: string[]
  type: string | null
  date: string | null
  tiers: string | null
  reference: string | null
  montant_ttc_cts: number | null
  resume: string | null
}

export interface ResultatRangement { id: string; ok: boolean; raison?: string }

/**
 * Range des documents confirmés dans le Drive (<dossier de rangement>/<chemin choisi>/<nom>) et les marque « classés » : UNE requête pour
 * tout le lot (dossiers créés une fois, envois en parallèle). En cas d'échec, rien ne change pour le document concerné.
 */
export async function rangerDansDrive(lot: Array<{ id: string; classement: ClassementConfirme }>): Promise<ResultatRangement[]> {
  const items = lot.map(({ id, classement: c }) => ({
    id, nom: c.nom, chemin: c.chemin,
    meta: { type: c.type, date: c.date, tiers: c.tiers, reference: c.reference, montant_ttc_cts: c.montant_ttc_cts, resume: c.resume },
  }))
  const { data, error } = await supabase.functions.invoke('drive-ranger', { body: { items } })
  if (error || !data?.ok) {
    const brut = (await lireErreurEdge(data, error))?.message ?? ''
    const raison = brut.includes('drive_not_connected') ? 'Google Drive n\'est pas connecté (Paramètres).' : brut.includes('drive_access_denied') ? 'Tu n\'as pas accès au Drive.' : brut || 'Envoi vers le Drive impossible'
    return lot.map(l => ({ id: l.id, ok: false, raison }))
  }
  const resultats = (data.data?.resultats ?? []) as ResultatRangement[]
  return lot.map(l => resultats.find(r => r.id === l.id) ?? { id: l.id, ok: false, raison: 'pas de réponse' })
}

/** Noms des clients, fournisseurs, salariés et plaques : « Dis-moi ce que c'est » s'en sert pour reconnaître le tiers. */
export async function chargerReferents(): Promise<Referents> {
  const noms = async (table: string, col: string) => {
    const { data } = await supabase.from(table).select(col).limit(500)
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(r => String(r[col] ?? '').trim()).filter(Boolean)
  }
  const [clients, fournisseurs, salaries, plaques] = await Promise.all([noms('clients', 'name'), noms('suppliers', 'name'), noms('team_members', 'full_name'), noms('vehicles', 'plate')])
  return { clients, fournisseurs, salaries, plaques }
}

/** Fiches par identifiant : d'où vient un document (fiche salarié, véhicule, client) et qui l'a déposé (profil → salarié). */
export async function chargerAnnuaire(): Promise<Annuaire> {
  const lire = async (table: string, colonnes: string) => ((await supabase.from(table).select(colonnes).limit(1000)).data ?? []) as unknown as Array<Record<string, string | null>>
  const [salaries, vehicules, clients] = await Promise.all([lire('team_members', 'id, full_name, profile_id'), lire('vehicles', 'id, plate'), lire('clients', 'id, name')])
  const a: Annuaire = { salaries: {}, salariesParProfil: {}, vehicules: {}, clients: {} }
  for (const r of salaries) { if (r.id && r.full_name) a.salaries[r.id] = r.full_name; if (r.profile_id && r.full_name) a.salariesParProfil[r.profile_id] = r.full_name }
  for (const r of vehicules) if (r.id && r.plate) a.vehicules[r.id] = r.plate
  for (const r of clients) if (r.id && r.name) a.clients[r.id] = r.name
  return a
}

/** Enregistre la proposition décrite par l'utilisateur : le document passe dans « À confirmer » sans lecture par l'IA. */
export async function ecrirePropositionSaisie(id: string, proposition: PropositionDocument) {
  return supabase.from('documents').update({ proposition, statut_tri: 'propose' }).eq('id', id).select('id')
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

export interface PropositionRenommage {
  id: string
  ancien: string
  nouveau: string
  type: string | null
  tiers: string | null
  date: string | null
  reference: string | null
  partie: string | null
  deja_conforme: boolean
  lu_via: 'image' | 'texte' | 'nom'
  raison?: string
}

/**
 * L'IA lit des fichiers DÉJÀ rangés dans le Drive et propose un nom selon la convention (Edge `drive-renommer-ia`, 6 fichiers au plus).
 * `reserves` = noms déjà proposés dans les paquets précédents du même dossier (jamais deux noms identiques). Rien n'est renommé ici.
 */
export async function proposerRenommages(fichiers: Array<{ id: string; nom: string }>, reserves: string[] = []): Promise<{ resultats: PropositionRenommage[]; erreur: string | null }> {
  const { data, error } = await supabase.functions.invoke('drive-renommer-ia', { body: { fichiers, reserves } })
  if (error || !data?.ok) {
    const brut = (await lireErreurEdge(data, error))?.message ?? ''
    const erreur = brut.includes('drive_not_connected') ? 'Le Drive n\'est pas connecté.' : brut.includes('drive_access_denied') ? 'Tu n\'as pas accès au Drive.' : brut || 'Lecture par l\'IA impossible'
    return { resultats: [], erreur }
  }
  return { resultats: (data.data?.resultats ?? []) as PropositionRenommage[], erreur: null }
}

/** Dossiers existants du Drive sous le dossier de rangement (chemins relatifs, 4 niveaux au plus) : sert au choix de « Où le ranger ». */
export async function arborescenceDrive(): Promise<string[][]> {
  const { data, error } = await supabase.functions.invoke('drive-browse', { body: { arbre: true } })
  if (error || !data?.ok || !data.racine_id) return []
  return cheminsDepuisDossiers((data.dossiers ?? []) as DossierDrive[], String(data.racine_id))
}

/** Mémorise le dossier du Drive où un document a été rangé (historique). */
export async function noterCheminDrive(id: string, chemin: string) {
  return supabase.from('documents').update({ drive_chemin: chemin }).eq('id', id)
}

/** Ouvre dans l'appli un document déjà rangé : depuis le Drive s'il y est, sinon depuis notre stockage. */
export async function lireDocumentRange(d: DocumentRow): Promise<{ url: string; type: 'image' | 'pdf' } | null> {
  if (d.drive_file_id) {
    const mime = d.mime_type ?? (/\.pdf$/i.test(d.file_name) ? 'application/pdf' : 'image/jpeg')
    const lu = await lireFichierDrive({ id: d.drive_file_id, name: d.file_name, mimeType: mime })
    if (lu) return lu
  }
  const url = await getDownloadUrl(d)
  return url ? { url, type: d.mime_type?.startsWith('image/') ? 'image' : 'pdf' } : null
}
