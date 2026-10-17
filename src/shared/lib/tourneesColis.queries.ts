// Accès base des tournées de colis (lot T1). Partagé : Mes courses › Ma tournée (salarié) et
// Tournées (bureau). Les droits sont tenus par la base (RLS de `tournees_colis` et
// `tournees_colis_arrets`, trigger `tournees_colis_arrets_garde`) : ici on lit / écrit, et on
// transforme les refus en message clair.
import imageCompression from 'browser-image-compression'
import { supabase } from '../../app/providers'
import { lireErreurEdge } from './erreurEdge'
import {
  arretsDepuisLecture, lignesArrets, statutApresGeste,
  type ArretColis, type ArretLu, type EnteteFeuille, type StatutArretColis, type StatutTourneeColis, type TourneeColis,
} from './tourneesColis'

const COLS_TOURNEE = '*, team_members!member_id(full_name), clients!client_id(name)'
const COLS_ARRET = 'id, tournee_id, company_id, rang, commune, cp, rue, numero, type, quantite, colis_remis, lat, lng, geo_precision, statut, statut_le, statut_par, note'

const REFUS = "Enregistrement refusé : la tournée est peut-être clôturée, ou ton compte n'a pas ce droit."

function erreurClaire(e: { message?: string; code?: string } | null): Error | null {
  if (!e) return null
  const m = e.message ?? ''
  if (/^Arrêt/.test(m)) return new Error(m)
  if (/row-level security|permission denied|42501/i.test(m)) return new Error(REFUS)
  if (/tournees_colis.*does not exist|relation .*tournees_colis/i.test(m) || e.code === '42P01') {
    return new Error("Les tournées de colis ne sont pas encore ouvertes sur le site : préviens le bureau.")
  }
  return new Error(m || 'Erreur inconnue')
}

// ── Lecture ─────────────────────────────────────────────────────────────────

/** Tournées d'une période (salarié : la RLS ne rend que les siennes). */
export async function listerTourneesColis(p: { du: string; au: string; memberId?: string }) {
  let q = supabase.from('tournees_colis').select(COLS_TOURNEE).gte('date', p.du).lte('date', p.au)
  if (p.memberId) q = q.eq('member_id', p.memberId)
  const { data, error } = await q.order('date', { ascending: false }).order('created_at', { ascending: true })
  return { data: (data ?? []) as unknown as TourneeColis[], error: erreurClaire(error) }
}

/** Arrêts d'une ou plusieurs tournées, dans l'ordre de la feuille. */
export async function arretsDesTournees(ids: string[]) {
  if (ids.length === 0) return { data: [] as ArretColis[], error: null }
  const { data, error } = await supabase.from('tournees_colis_arrets').select(COLS_ARRET)
    .in('tournee_id', ids).order('rang', { ascending: true })
  return { data: (data ?? []) as unknown as ArretColis[], error: erreurClaire(error) }
}

/** Salariés pour qui le bureau peut scanner (fiches actives) + leurs clients de messagerie. */
export async function membresPourTournee() {
  const { data, error } = await supabase.from('team_members')
    .select('id, full_name, clients_messagerie').eq('active', true).order('full_name')
  return {
    data: ((data ?? []) as Array<{ id: string; full_name: string; clients_messagerie: string[] | null }>)
      .map(m => ({ ...m, clients_messagerie: m.clients_messagerie ?? [] })),
    error: erreurClaire(error),
  }
}

/** Noms de clients (la RLS limite le salarié à ses clients de messagerie). */
export async function nomsClients(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data } = await supabase.from('clients').select('id, name').in('id', ids)
  return new Map((data ?? []).map((c: { id: string; name: string }) => [c.id, c.name]))
}

// ── Scan d'une page ─────────────────────────────────────────────────────────

/**
 * Photo d'une page → data URL JPEG ~130 Ko. Assez net pour lire un tableau imprimé, assez
 * léger pour la 4G du matin au dépôt.
 */
export async function compresserPage(file: File): Promise<string> {
  let f: File | Blob = file
  try {
    f = await imageCompression(file, {
      maxSizeMB: 0.13, maxWidthOrHeight: 1800, initialQuality: 0.75, fileType: 'image/jpeg', useWebWorker: true,
    })
  } catch { /* compression impossible : on envoie l'original, l'Edge refusera s'il est trop lourd */ }
  return imageCompression.getDataUrlFromFile(f as File)
}

/** Lit UNE page (Edge `lire-feuille-route`). Rien n'est écrit en base. */
export async function lirePageFeuille(dataUrl: string, page: number):
  Promise<{ arrets: ArretLu[]; entete: EnteteFeuille | null; error: Error | null }> {
  const { data, error } = await supabase.functions.invoke('lire-feuille-route', { body: { image: dataUrl } })
  const echec = await lireErreurEdge(data, error)
  if (echec) return { arrets: [], entete: null, error: new Error(echec.message) }
  const d = (data ?? {}) as { arrets?: unknown; entete?: EnteteFeuille | null }
  return { arrets: arretsDepuisLecture(d.arrets, page), entete: d.entete ?? null, error: null }
}

// ── Écriture ────────────────────────────────────────────────────────────────

/**
 * Crée la tournée puis ses arrêts. Si les arrêts sont refusés, la tournée vide est retirée :
 * jamais de tournée fantôme sans arrêt.
 */
export async function creerTourneeColis(p: {
  companyId: string
  memberId: string
  date: string
  clientId: string | null
  entete: EnteteFeuille
  arrets: ArretLu[]
}): Promise<{ id: string | null; error: Error | null }> {
  const { data, error } = await supabase.from('tournees_colis').insert({
    company_id: p.companyId, member_id: p.memberId, date: p.date, client_id: p.clientId, entete: p.entete,
  }).select('id').single()
  if (error || !data) return { id: null, error: erreurClaire(error) ?? new Error(REFUS) }
  const id = (data as { id: string }).id
  const { error: e2 } = await supabase.from('tournees_colis_arrets').insert(lignesArrets(p.arrets, id, p.companyId))
  if (e2) {
    await supabase.from('tournees_colis').delete().eq('id', id)
    return { id: null, error: erreurClaire(e2) }
  }
  return { id, error: null }
}

/**
 * Geste sur un arrêt (statut, colis remis, note). `statut_le` / `statut_par` sont posés par la
 * base. Le premier arrêt traité passe la tournée « en cours ».
 */
export async function majArret(
  arret: Pick<ArretColis, 'id' | 'tournee_id'>,
  patch: { statut?: StatutArretColis | null; colis_remis?: number | null; note?: string | null },
  tournee: { statut: StatutTourneeColis },
): Promise<{ data: ArretColis | null; error: Error | null }> {
  const { data, error } = await supabase.from('tournees_colis_arrets').update(patch)
    .eq('id', arret.id).select(COLS_ARRET)
  if (error) return { data: null, error: erreurClaire(error) }
  const ligne = (data ?? [])[0] as unknown as ArretColis | undefined
  if (!ligne) return { data: null, error: new Error(REFUS) }
  if (patch.statut && statutApresGeste(tournee.statut, 1) !== tournee.statut) {
    await supabase.from('tournees_colis').update({ statut: 'en_cours' }).eq('id', arret.tournee_id).eq('statut', 'a_faire')
  }
  return { data: ligne, error: null }
}

/** Retire une tournée et ses arrêts (scan raté). */
export async function supprimerTourneeColis(id: string): Promise<{ error: Error | null }> {
  const { data, error } = await supabase.from('tournees_colis').delete().eq('id', id).select('id')
  if (error) return { error: erreurClaire(error) }
  if (!data || data.length === 0) return { error: new Error(REFUS) }
  return { error: null }
}
