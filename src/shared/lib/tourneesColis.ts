// Tournée de colis (messagerie Colissimo, lot T1) — PUR, testé (tourneesColis.test.ts).
// Une feuille de route scannée = une tournée ; un arrêt = un numéro d'une rue (ou la rue
// entière), avec ses colis, son type (c domicile · rc point relais · col collecte) et son
// statut terrain. Ces arrêts ne sont PAS des `deliveries` (le relevé mensuel reste la seule
// ligne de facturation). Partagé : Mes courses › Ma tournée (salarié) et Tournées (bureau).

export type StatutTourneeColis = 'a_faire' | 'en_cours' | 'cloturee'
export type TypeArretColis = 'c' | 'rc' | 'col'
export type StatutArretColis =
  | 'livre' | 'avise' | 'instance' | 'refuse' | 'npai' | 'adresse' | 'acces' | 'endommage' | 'nonpres'
  | 'rc_remis' | 'rc_ferme' | 'rc_sature'
  | 'col_ok' | 'col_rien' | 'col_nf'

/** En-tête « Feuille de route » Colissimo (lu sur la 1re page), + pages scannées. */
export interface EnteteFeuille {
  date?: string | null
  societe?: string | null
  vehicule?: string | null
  imei?: string | null
  circuit?: string | null
  operateur?: string | null
  depart?: string | null
  remettant?: string | null
  adresse_remettant?: string | null
  livreur?: string | null
  nb_colis?: number | null
  nb_pgeo?: number | null
  /** Pages scannées pour créer la tournée. */
  pages?: number
}

/** « x/y » lu en bas à droite d'une page. */
export interface PageLue {
  numero: number
  total: number
}

export interface TourneeColis {
  id: string
  company_id: string
  member_id: string
  date: string
  client_id: string | null
  statut: StatutTourneeColis
  entete: EnteteFeuille | null
  created_by: string | null
  created_at: string
  updated_at: string
  /** Ordre affiché : celui de la feuille (`rang`), calculé par la route, ou réglé à la main. */
  ordre_mode?: OrdreMode | null
  ordre_calcule_le?: string | null
  /** Dernier calcul d'itinéraire (Edge `optimiser-tournee-colis`). */
  trajet?: TrajetTournee | null
  depart?: { lat: number; lng: number; source?: string } | null
  arrivee?: { mode: 'depart' | 'aucune' } | null
  cloturee_le?: string | null
  cloturee_par?: string | null
  team_members?: { full_name: string } | null
  clients?: { name: string } | null
}

export type OrdreMode = 'feuille' | 'route' | 'manuel'

export interface TrajetTournee {
  /** Tracé encodé (précision 5) : départ → arrêts → retour. */
  polyline: string
  /** Ordre calculé sans les temps de route (service d'itinéraire indisponible). */
  approximatif: boolean
  /** Tracé en lignes droites (le tracé routier n'a pas pu être obtenu). */
  trace_droit?: boolean
  km_total: number
  km_feuille: number
  duree_min: number
  mode: 'tout' | 'restants'
  depart: { lat: number; lng: number }
  depart_source?: string
  arrivee: 'depart' | 'aucune'
  calcule_a: string
  /** Ordre calculé (ids des arrêts), pour revenir à l'ordre calculé après un ordre manuel. */
  ordre_ids?: string[]
}

export interface ArretColis {
  id: string
  tournee_id: string
  company_id: string
  rang: number
  commune: string
  cp: string | null
  rue: string
  numero: string | null
  type: TypeArretColis
  quantite: number
  colis_remis: number | null
  lat: number | null
  lng: number | null
  geo_precision: 'numero' | 'rue' | 'manuel' | null
  statut: StatutArretColis | null
  statut_le: string | null
  statut_par: string | null
  note: string | null
  /** Place dans l'ordre de passage (route ou manuel) ; null = pas placé. `rang` reste la feuille. */
  ordre?: number | null
  /** Minutes depuis le départ jusqu'à cet arrêt (dernier calcul). */
  eta_min?: number | null
}

/** Arrêt lu sur la feuille (Edge `lire-feuille-route`), corrigé dans l'aperçu avant création. */
export interface ArretLu {
  /** Clé locale de l'aperçu (pas en base). */
  cle: string
  commune: string | null
  cp: string | null
  /** Colonne District de la feuille (secteur, pas commune) : affichée, pas enregistrée. */
  secteur: string | null
  rue: string | null
  numero: string | null
  quantite: number
  type: TypeArretColis
  note: string | null
  a_verifier: boolean
  /** Pourquoi « à vérifier » (écart Nb Colis / Nb PGEO, chiffre illisible…). */
  motif: string | null
  lat: number | null
  lng: number | null
  geo_precision: 'numero' | 'rue' | null
  /** Page de la feuille (1, 2…). */
  page: number
}

// ── Libellés ────────────────────────────────────────────────────────────────

export const LIBELLE_TYPE_ARRET: Record<TypeArretColis, string> = {
  c: 'Domicile', rc: 'Point relais', col: 'Collecte',
}

export const LIBELLE_STATUT_ARRET: Record<StatutArretColis, string> = {
  livre: 'Livré', avise: 'Avisé', instance: 'En instance', refuse: 'Refusé', npai: 'NPAI',
  adresse: 'Adresse incomplète', acces: 'Accès impossible', endommage: 'Endommagé',
  nonpres: 'Non présenté', rc_remis: 'Remis au relais', rc_ferme: 'Relais fermé',
  rc_sature: 'Relais saturé', col_ok: 'Collecté', col_rien: 'Rien à collecter',
  col_nf: 'Collecte non faite',
}

export const LIBELLE_STATUT_TOURNEE: Record<StatutTourneeColis, string> = {
  a_faire: 'À faire', en_cours: 'En cours', cloturee: 'Clôturée',
}

/** Le geste « fait » d'un arrêt, selon son type (un seul appui). */
export const STATUT_FAIT: Record<TypeArretColis, StatutArretColis> = {
  c: 'livre', rc: 'rc_remis', col: 'col_ok',
}

/** Les autres issues proposées, selon le type. */
export const AUTRES_STATUTS: Record<TypeArretColis, StatutArretColis[]> = {
  c: ['avise', 'instance', 'refuse', 'acces', 'npai', 'adresse', 'endommage'],
  rc: ['rc_ferme', 'rc_sature', 'acces'],
  col: ['col_rien', 'col_nf', 'acces'],
}

// ── Familles ────────────────────────────────────────────────────────────────

/**
 * Familles alignées sur l'outil des livreurs (décision du 18/10/2026) :
 * - livré : le colis est remis (domicile, relais) ou la collecte est faite ;
 * - attente : le colis reste disponible pour le destinataire (avis de passage, instance) ;
 * - retour : le colis revient au dépôt ce jour (refus, NPAI, adresse incomplète, accès
 *   impossible, endommagé, non présenté, relais fermé ou saturé, collecte non faite) ;
 * - neutre : arrêt traité sans colis, ni livré ni retour (« rien à collecter »).
 */
export type FamilleStatut = 'livre' | 'attente' | 'retour' | 'neutre'

const FAMILLE: Record<StatutArretColis, FamilleStatut> = {
  livre: 'livre', rc_remis: 'livre', col_ok: 'livre',
  avise: 'attente', instance: 'attente',
  refuse: 'retour', npai: 'retour', adresse: 'retour', acces: 'retour', endommage: 'retour',
  nonpres: 'retour', rc_ferme: 'retour', rc_sature: 'retour', col_nf: 'retour',
  col_rien: 'neutre',
}

export function familleStatut(s: StatutArretColis | null | undefined): FamilleStatut | null {
  return s ? FAMILLE[s] ?? null : null
}

/** Colis réellement remis à un arrêt (partiel possible) ; 0 si non livré (neutre compris). */
export function colisRemis(a: Pick<ArretColis, 'statut' | 'quantite' | 'colis_remis'>): number {
  if (familleStatut(a.statut) !== 'livre') return 0
  return Math.min(a.quantite, Math.max(0, a.colis_remis ?? a.quantite))
}

// ── Compteurs ───────────────────────────────────────────────────────────────

export interface CompteursTournee {
  /** Arrêts de livraison (domicile + relais). */
  arrets: number
  arretsTraites: number
  /** Colis à livrer (domicile + relais). */
  colis: number
  colisTraites: number
  colisLivres: number
  colisAttente: number
  colisRetour: number
  collectes: number
  collectesTraitees: number
}

/**
 * Un arrêt est traité dès qu'il a un statut. Ses colis comptent « traités » ; « livrés » =
 * colis remis (partiel compris), le reste d'un livré partiel compte en attente. Un arrêt
 * « neutre » est traité mais compte 0 colis (ni livré, ni attente, ni retour). Les
 * collectes sont comptées à part : elles n'apportent aucun colis à livrer.
 */
export function compteursTournee(arrets: Array<Pick<ArretColis, 'type' | 'statut' | 'quantite' | 'colis_remis'>>): CompteursTournee {
  const c: CompteursTournee = {
    arrets: 0, arretsTraites: 0, colis: 0, colisTraites: 0, colisLivres: 0, colisAttente: 0,
    colisRetour: 0, collectes: 0, collectesTraitees: 0,
  }
  for (const a of arrets) {
    if (a.type === 'col') {
      c.collectes++
      if (a.statut) c.collectesTraitees++
      continue
    }
    c.arrets++
    c.colis += a.quantite
    const f = familleStatut(a.statut)
    if (!f) continue
    c.arretsTraites++
    if (f === 'neutre') continue
    c.colisTraites += a.quantite
    if (f === 'livre') {
      const r = colisRemis(a)
      c.colisLivres += r
      c.colisAttente += a.quantite - r
    } else if (f === 'attente') c.colisAttente += a.quantite
    else c.colisRetour += a.quantite
  }
  return c
}

/** Avancement 0 → 100 (arrêts traités, collectes comprises). */
export function avancementPct(c: CompteursTournee): number {
  const total = c.arrets + c.collectes
  if (total === 0) return 0
  return Math.round(((c.arretsTraites + c.collectesTraitees) / total) * 100)
}

/** Statut de la tournée après un geste : un premier arrêt traité la passe « en cours ». */
export function statutApresGeste(t: StatutTourneeColis, arretsTraites: number): StatutTourneeColis {
  return t === 'a_faire' && arretsTraites > 0 ? 'en_cours' : t
}

// ── Aperçu avant création ───────────────────────────────────────────────────

let compteurCle = 0
/** Clé locale unique d'un arrêt de l'aperçu. */
export function nouvelleCle(): string {
  compteurCle += 1
  return `a${Date.now().toString(36)}${compteurCle}`
}

export function arretVide(page: number, modele?: Pick<ArretLu, 'commune' | 'cp'> & Partial<Pick<ArretLu, 'secteur'>>): ArretLu {
  return {
    cle: nouvelleCle(), commune: modele?.commune ?? null, cp: modele?.cp ?? null, secteur: modele?.secteur ?? null,
    rue: null, numero: null, quantite: 1, type: 'c', note: null, a_verifier: false, motif: null,
    lat: null, lng: null, geo_precision: null, page,
  }
}

/** Réponse de l'Edge (déjà nettoyée côté serveur) → arrêts de l'aperçu, revérifiés. */
export function arretsDepuisLecture(brut: unknown, page: number): ArretLu[] {
  if (!Array.isArray(brut)) return []
  const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return brut.filter(x => x && typeof x === 'object').map(x => {
    const a = x as Record<string, unknown>
    const type = a.type === 'rc' || a.type === 'col' ? a.type : 'c'
    const q = Number(a.quantite)
    const prec = a.geo_precision === 'numero' || a.geo_precision === 'rue' ? a.geo_precision : null
    return {
      cle: nouvelleCle(), commune: txt(a.commune), cp: txt(a.cp), secteur: txt(a.secteur),
      rue: txt(a.rue), numero: txt(a.numero),
      quantite: Number.isInteger(q) && q >= 1 ? Math.min(q, 999) : 1, type, note: txt(a.note),
      a_verifier: a.a_verifier === true || !!txt(a.motif), motif: txt(a.motif), lat: num(a.lat), lng: num(a.lng),
      geo_precision: prec, page,
    }
  })
}

/** Ce qui bloque la création (seul le strict minimum : commune et rue de chaque arrêt). */
export function manquesApercu(arrets: ArretLu[]): string[] {
  if (arrets.length === 0) return ['Aucun arrêt']
  const m: string[] = []
  const sansCommune = arrets.filter(a => !a.commune?.trim()).length
  const sansRue = arrets.filter(a => !a.rue?.trim()).length
  if (sansCommune) m.push(`${sansCommune} arrêt${sansCommune > 1 ? 's' : ''} sans commune`)
  if (sansRue) m.push(`${sansRue} arrêt${sansRue > 1 ? 's' : ''} sans rue`)
  return m
}

/** Totaux de l'aperçu, pour les comparer à l'en-tête de la feuille. */
export function totauxApercu(arrets: ArretLu[]): { arrets: number; colis: number; collectes: number; aVerifier: number } {
  let colis = 0; let collectes = 0; let aVerifier = 0; let n = 0
  for (const a of arrets) {
    if (a.a_verifier) aVerifier++
    if (a.type === 'col') { collectes++; continue }
    n++; colis += a.quantite
  }
  return { arrets: n, colis, collectes, aVerifier }
}

/** Un changement d'adresse rend la position lue caduque. */
export function modifierArretLu(a: ArretLu, patch: Partial<Omit<ArretLu, 'cle'>>): ArretLu {
  const adresse = (['commune', 'cp', 'rue', 'numero'] as const).some(k => k in patch && patch[k] !== a[k])
  const r = { ...a, ...patch }
  if (adresse) { r.lat = null; r.lng = null; r.geo_precision = null }
  if ('quantite' in patch) r.quantite = Math.max(1, Math.min(999, Math.round(Number(patch.quantite) || 1)))
  return r
}

/** Aperçu → lignes `tournees_colis_arrets` (rang = ordre de la feuille, page après page). */
export function lignesArrets(arrets: ArretLu[], tourneeId: string, companyId: string) {
  return arrets.map((a, i) => ({
    tournee_id: tourneeId, company_id: companyId, rang: i + 1,
    commune: (a.commune ?? '').trim().toUpperCase(), cp: a.cp?.trim() || null,
    rue: (a.rue ?? '').trim(), numero: a.numero?.trim() || null,
    type: a.type, quantite: a.quantite, note: a.note?.trim() || null,
    lat: a.lat, lng: a.lng, geo_precision: a.geo_precision,
  }))
}

/** En-têtes des pages → un seul en-tête (premières valeurs lues ; colis / PGEO : la plus grande). */
export function fusionnerEntetes(entetes: Array<EnteteFeuille | null | undefined>, pages: number): EnteteFeuille {
  const out: EnteteFeuille = { pages }
  for (const e of entetes) {
    if (!e) continue
    for (const k of ['date', 'societe', 'vehicule', 'imei', 'circuit', 'operateur', 'depart', 'remettant', 'adresse_remettant', 'livreur'] as const) {
      if (out[k] == null && typeof e[k] === 'string' && e[k]) out[k] = e[k]
    }
    for (const k of ['nb_colis', 'nb_pgeo'] as const) {
      const v = e[k]
      if (typeof v === 'number' && (out[k] == null || v > (out[k] as number))) out[k] = v
    }
  }
  return out
}

/** Réponse de l'Edge → « x/y » sûr, sinon null. */
export function pageDepuisLecture(brut: unknown): PageLue | null {
  if (!brut || typeof brut !== 'object') return null
  const { numero, total } = brut as Record<string, unknown>
  return Number.isInteger(numero) && Number.isInteger(total) && (numero as number) >= 1
    && (numero as number) <= (total as number) && (total as number) <= 99
    ? { numero: numero as number, total: total as number } : null
}

/**
 * Pages de la feuille non scannées, d'après les « x/y » lus (ex. 1/3 et 3/3 → [2]).
 * Aucune page numérotée lue → [] (rien à affirmer). Pur.
 */
export function pagesManquantes(lues: Array<PageLue | null | undefined>): number[] {
  const ok = lues.filter((p): p is PageLue => !!p)
  if (ok.length === 0) return []
  const total = Math.max(...ok.map(p => p.total))
  const vues = new Set(ok.map(p => p.numero))
  return Array.from({ length: total }, (_, i) => i + 1).filter(n => !vues.has(n))
}

/** Même page de la feuille photographiée deux fois (ex. deux « 2/3 »). Pur. */
export function pagesEnDouble(lues: Array<PageLue | null | undefined>): number[] {
  const vus = new Map<number, number>()
  for (const p of lues) if (p) vus.set(p.numero, (vus.get(p.numero) ?? 0) + 1)
  return [...vus].filter(([, n]) => n > 1).map(([numero]) => numero).sort((a, b) => a - b)
}

/**
 * Arrêts de l'aperçu dans l'ordre de la FEUILLE : par « x/y » lu quand il l'a été (une page
 * manquante photographiée en dernier reprend sa place), sinon par ordre des photos ; l'ordre
 * des arrêts d'une même page est gardé. `pagesLues[i]` = page lue sur la photo i + 1. Pur.
 */
export function ordonnerParPage(arrets: ArretLu[], pagesLues: Array<PageLue | null | undefined>): ArretLu[] {
  const cle = (photo: number) => pagesLues[photo - 1]?.numero ?? photo
  return arrets.map((a, i) => ({ a, i }))
    .sort((x, y) => cle(x.a.page) - cle(y.a.page) || x.a.page - y.a.page || x.i - y.i)
    .map(x => x.a)
}

/** Retire la photo n° `photo` : ses arrêts partent, les photos suivantes remontent d'un rang. Pur. */
export function retirerPhoto(arrets: ArretLu[], photo: number): ArretLu[] {
  return arrets.filter(a => a.page !== photo).map(a => (a.page > photo ? { ...a, page: a.page - 1 } : a))
}
