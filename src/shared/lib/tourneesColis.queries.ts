// Accès base des tournées de colis (lot T1). Partagé : Mes courses › Ma tournée (salarié) et
// Tournées (bureau). Les droits sont tenus par la base (RLS de `tournees_colis` et
// `tournees_colis_arrets`, trigger `tournees_colis_arrets_garde`) : ici on lit / écrit, et on
// transforme les refus en message clair.
import imageCompression from 'browser-image-compression'
import { supabase } from '../../app/providers'
import { lireErreurEdge } from './erreurEdge'
import { uploadDocument, getDownloadUrl } from './documents.queries'
import type { DocumentRow } from './documents.types'
import { enregistrerJournee } from './journeesColis.queries'
import { journeeDepuisArrets } from './tourneesColisRoute'
import {
  arretsDepuisLecture, lignesArrets, ordreHabituel, pageDepuisLecture, statutApresGeste, type PageLue,
  type ArretColis, type ArretLu, type EnteteFeuille, type StatutArretColis, type StatutTourneeColis, type TourneeColis,
} from './tourneesColis'

const COLS_TOURNEE = '*, team_members!member_id(full_name), clients!client_id(name)'
const COLS_ARRET = 'id, tournee_id, company_id, rang, commune, cp, rue, numero, type, quantite, colis_remis, lat, lng, geo_precision, statut, statut_le, statut_par, note, ordre, eta_min, rang_habituel'

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
export async function lirePageFeuille(dataUrl: string, page: number, communePrecedente: string | null = null):
  Promise<{ arrets: ArretLu[]; entete: EnteteFeuille | null; pageLue: PageLue | null; error: Error | null }> {
  const { data, error } = await supabase.functions.invoke('lire-feuille-route', {
    body: { image: dataUrl, ...(communePrecedente ? { commune_precedente: communePrecedente } : {}) },
  })
  const echec = await lireErreurEdge(data, error)
  if (echec) return { arrets: [], entete: null, pageLue: null, error: new Error(echec.message) }
  const d = (data ?? {}) as { arrets?: unknown; entete?: EnteteFeuille | null; page?: unknown }
  return {
    arrets: arretsDepuisLecture(d.arrets, page), entete: d.entete ?? null,
    pageLue: pageDepuisLecture(d.page), error: null,
  }
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
    // Rues connues du référentiel : la tournée naît dans l'ordre habituel du livreur.
    ordre_mode: ordreHabituel(p.arrets) ? 'habituel' : 'feuille',
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

// ── Ordre de passage et carte (lot 2) ───────────────────────────────────────

export interface ResultatItineraire {
  approximatif: boolean
  message?: string
  km_total: number
  duree_min: number
  km_feuille: number
  places: number
  a_placer: number
}

/** Calcule l'ordre par la route (Edge `optimiser-tournee-colis`) : tout, ou les restants depuis une position. */
export async function calculerItineraire(p: {
  tourneeId: string
  mode: 'tout' | 'restants'
  depart?: { lat: number; lng: number } | null
}): Promise<{ data: ResultatItineraire | null; error: Error | null }> {
  const { data, error } = await supabase.functions.invoke('optimiser-tournee-colis', {
    body: { tournee_id: p.tourneeId, mode: p.mode, ...(p.depart ? { depart: p.depart } : {}) },
  })
  const echec = await lireErreurEdge(data, error)
  if (echec) return { data: null, error: new Error(echec.message) }
  return { data: data as ResultatItineraire, error: null }
}

/** Adresse tapée → position (BAN, via l'Edge `geocode`). */
export async function chercherAdresse(adresse: string): Promise<{ lat: number; lng: number } | null> {
  const { data, error } = await supabase.functions.invoke('geocode', { body: { address: adresse } })
  const d = data as { ok?: boolean; lat?: number; lng?: number } | null
  if (error || !d?.ok || !Number.isFinite(d.lat) || !Number.isFinite(d.lng)) return null
  return { lat: d.lat!, lng: d.lng! }
}

/**
 * Place un arrêt à la main (carte ou adresse) : `geo_precision = 'manuel'`. La position est
 * apprise par le référentiel (rue connue) : la prochaine feuille trouvera ce numéro toute seule.
 */
export async function placerArret(arretId: string, pos: { lat: number; lng: number }) {
  const { data, error } = await supabase.from('tournees_colis_arrets')
    .update({ lat: pos.lat, lng: pos.lng, geo_precision: 'manuel' }).eq('id', arretId).select(COLS_ARRET)
  if (error) return { data: null, error: erreurClaire(error) }
  const l = (data ?? [])[0] as unknown as ArretColis | undefined
  if (l) await supabase.rpc('apprendre_position_arret', { p_arret: arretId }).then(() => undefined, () => undefined)
  return l ? { data: l, error: null } : { data: null, error: new Error(REFUS) }
}

/** Écrit un ordre (ids dans l'ordre) puis le mode de la tournée. Les absents perdent leur place. */
export async function ecrireOrdre(tourneeId: string, ids: string[], tous: string[], mode: 'manuel' | 'route' | 'habituel') {
  const place = new Map(ids.map((id, i) => [id, i + 1]))
  const ecritures = tous.map(id => ({ id, ordre: place.get(id) ?? null }))
  for (let i = 0; i < ecritures.length; i += 10) {
    const lot = await Promise.all(ecritures.slice(i, i + 10).map(e =>
      supabase.from('tournees_colis_arrets').update({ ordre: e.ordre }).eq('id', e.id).select('id')))
    const ko = lot.find(r => r.error || !r.data?.length)
    if (ko) return { error: erreurClaire(ko.error) ?? new Error(REFUS) }
  }
  const { data, error } = await supabase.from('tournees_colis').update({ ordre_mode: mode }).eq('id', tourneeId).select('id')
  if (error) return { error: erreurClaire(error) }
  return { error: data?.length ? null : new Error(REFUS) }
}

// ── Suivi en direct (lot 3) ─────────────────────────────────────────────────

export interface PositionLivreur {
  member_id: string
  tournee_id: string | null
  lat: number
  lng: number
  precision_m: number | null
  maj_le: string
}

/** Le livreur envoie SA dernière position (une ligne par livreur, pas d'historique). */
export async function envoyerPosition(p: {
  companyId: string; memberId: string; tourneeId: string; lat: number; lng: number; precision: number | null
}) {
  const { error } = await supabase.from('positions_livreurs').upsert({
    member_id: p.memberId, company_id: p.companyId, tournee_id: p.tourneeId, lat: p.lat, lng: p.lng,
    precision_m: p.precision == null ? null : Math.round(p.precision), maj_le: new Date().toISOString(),
  }, { onConflict: 'member_id' })
  return { error: erreurClaire(error) }
}

/** Arrêt du partage : la position est effacée (le bureau ne voit plus rien). */
export async function effacerPosition(memberId: string) {
  const { error } = await supabase.from('positions_livreurs').delete().eq('member_id', memberId)
  return { error: erreurClaire(error) }
}

/** Positions partagées (bureau). */
export async function positionsLivreurs() {
  const { data, error } = await supabase.from('positions_livreurs')
    .select('member_id, tournee_id, lat, lng, precision_m, maj_le')
  return { data: (data ?? []) as PositionLivreur[], error: erreurClaire(error) }
}

// ── Preuves et clôture (lot 4) ──────────────────────────────────────────────

/** Photos de preuve des arrêts (documents `entity_type = 'arret_colis'`). */
export async function photosArrets(ids: string[]) {
  if (ids.length === 0) return { data: [] as DocumentRow[], error: null }
  const { data, error } = await supabase.from('documents').select('*')
    .eq('entity_type', 'arret_colis').in('entity_id', ids).order('created_at', { ascending: true })
  return { data: (data ?? []) as DocumentRow[], error: erreurClaire(error) }
}

export async function ajouterPhotoArret(file: File, companyId: string, arretId: string) {
  const { data, error } = await uploadDocument(file, companyId, {
    entity_type: 'arret_colis', entity_id: arretId, category: 'POD',
  })
  return { data, error: error ? erreurClaire(error) : null }
}

export function urlPhotoArret(doc: DocumentRow) {
  return getDownloadUrl(doc)
}

/**
 * Clôture par le livreur (ou le bureau). La base horodate ; plus rien n'est modifiable ensuite.
 * Le partage de position s'arrête avec elle (la ligne du livreur est effacée, s'il en a une).
 */
export async function cloturerTournee(id: string) {
  const { data, error } = await supabase.from('tournees_colis').update({ statut: 'cloturee' }).eq('id', id).select(COLS_TOURNEE)
  if (error) return { data: null, error: erreurClaire(error) }
  const t = (data ?? [])[0] as unknown as TourneeColis | undefined
  if (t) await supabase.from('positions_livreurs').delete().eq('member_id', t.member_id).eq('tournee_id', id)
  return t ? { data: t, error: null } : { data: null, error: new Error(REFUS) }
}

/** Réouverture par le bureau (droit Tournées). */
export async function rouvrirTournee(id: string) {
  const { data, error } = await supabase.from('tournees_colis').update({ statut: 'en_cours' }).eq('id', id).select('id')
  if (error) return { error: erreurClaire(error) }
  return { error: data?.length ? null : new Error(REFUS) }
}

// ── Journée de colis déduite (lot 5) ────────────────────────────────────────

export type ResultatJournee = 'creee' | 'mise_a_jour' | 'deja_envoyee' | 'deja_saisie' | 'sans_client'

/** Note posée par le préremplissage : une journée qui la porte encore n'a pas été retouchée. */
const NOTE_AUTO = 'Compté depuis'

/**
 * Après une clôture : la journée de colis (même salarié, jour, client) est préremplie en
 * BROUILLON depuis toutes ses tournées clôturées du jour. Le salarié vérifie, ajoute la photo du
 * compteur et envoie (Ma journée). Jamais touchée : une journée envoyée ou validée, ni une
 * journée saisie ou corrigée à la main (brouillon sans la note automatique, refusée).
 */
export async function preremplirJournee(p: { companyId: string; memberId: string; date: string; clientId: string | null }):
  Promise<{ etat: ResultatJournee; error: Error | null }> {
  if (!p.clientId) return { etat: 'sans_client', error: null }
  const { data: ts, error: eT } = await supabase.from('tournees_colis').select('id')
    .eq('member_id', p.memberId).eq('date', p.date).eq('client_id', p.clientId).eq('statut', 'cloturee')
  if (eT) return { etat: 'sans_client', error: erreurClaire(eT) }
  const ids = (ts ?? []).map((t: { id: string }) => t.id)
  const { data: arrets, error: eA } = await arretsDesTournees(ids)
  if (eA) return { etat: 'sans_client', error: eA }
  const colis = journeeDepuisArrets(arrets)

  const { data: j, error: eJ } = await supabase.from('journees_colis').select('id, statut, note')
    .eq('member_id', p.memberId).eq('date', p.date).eq('client_id', p.clientId).maybeSingle()
  if (eJ) return { etat: 'sans_client', error: erreurClaire(eJ) }
  const existante = j as { id: string; statut: string; note: string | null } | null
  if (existante && (existante.statut === 'envoyee' || existante.statut === 'validee')) return { etat: 'deja_envoyee', error: null }
  if (existante && (existante.statut !== 'brouillon' || !(existante.note ?? '').startsWith(NOTE_AUTO))) return { etat: 'deja_saisie', error: null }

  const { error } = await enregistrerJournee({
    id: existante?.id ?? null, companyId: p.companyId, memberId: p.memberId, date: p.date, clientId: p.clientId,
    champs: { ...colis, note: `${NOTE_AUTO} ${ids.length > 1 ? `${ids.length} tournées` : 'la tournée'} de colis.` },
    statut: 'brouillon',
  })
  return { etat: existante ? 'mise_a_jour' : 'creee', error }
}

/** Horaires du jour des points La Poste de la zone (Edge `horaires-relais-poste`), gardés par jour en mémoire. */
const horairesPoste = new Map<string, Promise<Record<string, { plages: string[]; ferme: boolean }>>>()
export function horairesRelaisPoste(ids: string[], jour: string): Promise<Record<string, { plages: string[]; ferme: boolean }>> {
  const cle = `${jour}|${ids.join(',')}`
  let p = horairesPoste.get(cle)
  if (!p) {
    p = supabase.functions.invoke('horaires-relais-poste', { body: { ids } })
      .then(({ data }) => {
        const d = data as { ok?: boolean; sites?: Record<string, { plages: string[]; ferme: boolean }> } | null
        if (!d?.ok || !d.sites) { horairesPoste.delete(cle); return {} }
        return d.sites
      }, () => { horairesPoste.delete(cle); return {} })
    horairesPoste.set(cle, p)
  }
  return p
}
