// Accès base des journées de colis (lot S1). Partagé : Mes courses (salarié) et Équipe (bureau).
// Les droits sont tenus par la base (RLS + trigger `journees_colis_garde`) : ces fonctions ne
// font que lire / écrire, et transforment « 0 ligne touchée » en erreur claire.
import { supabase } from '../../app/providers'
import { uploadDocument, getDownloadUrl, deleteDocument } from './documents.queries'
import type { DocumentRow } from './documents.types'
import type { JourneeColis, HistoriqueJournee, StatutJournee } from './journeesColis'

const COLS = '*, clients!client_id(name), team_members!member_id(full_name)'

const REFUS = "Enregistrement refusé : la journée est peut-être déjà validée, ou ton compte n'a pas ce droit."

function erreurClaire(e: { message?: string } | null): Error | null {
  if (!e) return null
  const m = e.message ?? ''
  // Messages du trigger : déjà en français, on les garde tels quels.
  if (/^Journée/.test(m)) return new Error(m)
  if (/row-level security|permission denied|42501/i.test(m)) return new Error(REFUS)
  if (/journees_colis_unique|duplicate key/i.test(m)) return new Error('Une journée existe déjà pour ce client à cette date.')
  return new Error(m || 'Erreur inconnue')
}

/** Journées d'une période. Salarié : la RLS ne rend que les siennes. */
export async function listerJournees(p: { du: string; au: string; memberId?: string; statut?: StatutJournee }) {
  let q = supabase.from('journees_colis').select(COLS).gte('date', p.du).lte('date', p.au)
  if (p.memberId) q = q.eq('member_id', p.memberId)
  if (p.statut) q = q.eq('statut', p.statut)
  const { data, error } = await q.order('date', { ascending: false }).order('created_at', { ascending: true })
  return { data: (data ?? []) as unknown as JourneeColis[], error: erreurClaire(error) }
}

/** Journées envoyées au bureau, plus anciennes d'abord. */
export async function journeesAValider() {
  const { data, error } = await supabase.from('journees_colis').select(COLS)
    .eq('statut', 'envoyee').order('date', { ascending: true }).order('envoyee_le', { ascending: true })
  return { data: (data ?? []) as unknown as JourneeColis[], error: erreurClaire(error) }
}

export async function compterJourneesAValider(): Promise<number> {
  const { count } = await supabase.from('journees_colis').select('id', { count: 'exact', head: true }).eq('statut', 'envoyee')
  return count ?? 0
}

export interface ChampsJournee {
  colis_domicile: number
  colis_relais: number
  colis_litige: number
  litige_raison: string | null
  note: string | null
}

/** Crée ou met à jour la journée du salarié (brouillon ou envoi). */
export async function enregistrerJournee(p: {
  id?: string | null
  companyId: string
  memberId: string
  date: string
  clientId: string
  champs: ChampsJournee
  statut: 'brouillon' | 'envoyee'
}): Promise<{ data: JourneeColis | null; error: Error | null }> {
  const ligne = { ...p.champs, client_id: p.clientId, statut: p.statut }
  const req = p.id
    ? supabase.from('journees_colis').update(ligne).eq('id', p.id).select(COLS)
    : supabase.from('journees_colis').insert({ ...ligne, company_id: p.companyId, member_id: p.memberId, date: p.date }).select(COLS)
  const { data, error } = await req
  if (error) return { data: null, error: erreurClaire(error) }
  const ligneLue = (data ?? [])[0] as unknown as JourneeColis | undefined
  if (!ligneLue) return { data: null, error: new Error(REFUS) }
  return { data: ligneLue, error: null }
}

/** Supprime une journée. Bureau sur une journée validée : `motif` obligatoire (tracé). */
export async function supprimerJournee(id: string, motif?: string): Promise<{ error: Error | null }> {
  if (motif) {
    const { error } = await supabase.from('journees_colis').update({ motif_modification: motif }).eq('id', id)
    if (error) return { error: erreurClaire(error) }
  }
  const { data, error } = await supabase.from('journees_colis').delete().eq('id', id).select('id')
  if (error) return { error: erreurClaire(error) }
  if (!data || data.length === 0) return { error: new Error(REFUS) }
  return { error: null }
}

async function majBureau(id: string, maj: Record<string, unknown>): Promise<{ error: Error | null }> {
  const { data, error } = await supabase.from('journees_colis').update(maj).eq('id', id).select('id')
  if (error) return { error: erreurClaire(error) }
  if (!data || data.length === 0) return { error: new Error(REFUS) }
  return { error: null }
}

/** Valide (nombres validés = déclarés, sauf correction passée). */
export function validerJournee(id: string, valides?: { domicile: number; relais: number; litige: number }) {
  return majBureau(id, {
    statut: 'validee',
    ...(valides ? { domicile_valide: valides.domicile, relais_valide: valides.relais, litige_valide: valides.litige } : {}),
  })
}

/** Renvoie au salarié pour correction, avec le motif. */
export function refuserJournee(id: string, motif: string) {
  return majBureau(id, { statut: 'refusee', motif_refus: motif })
}

/** Corrige une journée DÉJÀ validée (motif obligatoire, tracé par la base). */
export function corrigerJournee(id: string, valides: { domicile: number; relais: number; litige: number }, motif: string) {
  return majBureau(id, {
    domicile_valide: valides.domicile, relais_valide: valides.relais, litige_valide: valides.litige,
    motif_modification: motif,
  })
}

/** Rouvre une journée validée (repasse « envoyée »), motif obligatoire. */
export function rouvrirJournee(id: string, motif: string) {
  return majBureau(id, { statut: 'envoyee', motif_modification: motif })
}

export async function historiqueJournee(id: string) {
  const { data, error } = await supabase.from('journees_colis_historique').select('*')
    .eq('journee_id', id).order('le', { ascending: true })
  return { data: (data ?? []) as HistoriqueJournee[], error: erreurClaire(error) }
}

// ── Photos (documents `entity_type = 'journee_colis'`) ───────────────────────

export async function photosJournee(id: string) {
  const { data, error } = await supabase.from('documents').select('*')
    .eq('entity_type', 'journee_colis').eq('entity_id', id).order('created_at', { ascending: true })
  return { data: (data ?? []) as DocumentRow[], error: erreurClaire(error) }
}

/** Photos de plusieurs journées d'un coup (écran de validation). */
export async function photosJournees(ids: string[]) {
  if (ids.length === 0) return { data: [] as DocumentRow[], error: null }
  const { data, error } = await supabase.from('documents').select('*')
    .eq('entity_type', 'journee_colis').in('entity_id', ids).order('created_at', { ascending: true })
  return { data: (data ?? []) as DocumentRow[], error: erreurClaire(error) }
}

export async function ajouterPhotoJournee(file: File, companyId: string, journeeId: string) {
  const { data, error } = await uploadDocument(file, companyId, {
    entity_type: 'journee_colis', entity_id: journeeId, category: 'Compteur appareil',
  })
  return { data, error: error ? erreurClaire(error) : null }
}

export async function urlPhoto(doc: DocumentRow) {
  return getDownloadUrl(doc)
}

export async function retirerPhoto(doc: DocumentRow) {
  const { error } = await deleteDocument(doc)
  return { error: error ? erreurClaire(error) : null }
}
