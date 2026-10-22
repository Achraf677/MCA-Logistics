// Tournée de colis, lots 2 à 5 (ordre par la route, carte, suivi, clôture, comptage) — PUR,
// testé (tourneesColisRoute.test.ts). Partagé : Mes courses › Ma tournée (salarié) et
// Tournées (bureau). Le calcul de l'ordre lui-même est côté Edge (`optimiser-tournee-colis`,
// `_shared/tourneeRoute.ts`) ; ici, ce que les écrans en font.
import {
  LIBELLE_STATUT_ARRET, familleStatut,
  type ArretColis, type FamilleStatut, type OrdreMode, type StatutArretColis, type TourneeColis, type TypeArretColis,
} from './tourneesColis'

// ── Ordre d'affichage ───────────────────────────────────────────────────────

export function modeOrdre(t: Pick<TourneeColis, 'ordre_mode'> | null | undefined): OrdreMode {
  const m = t?.ordre_mode
  return m === 'route' || m === 'manuel' || m === 'habituel' ? m : 'feuille'
}

/** Pas encore d'itinéraire calculé : ordre de la feuille, ou ordre habituel du livreur. */
export function sansCalcul(mode: OrdreMode): boolean {
  return mode === 'feuille' || mode === 'habituel'
}

/** Ids des arrêts dans l'ordre habituel (référentiel) ; vide si la tournée n'en a pas. */
export function idsOrdreHabituel(arrets: ArretColis[]): string[] {
  return arrets.filter(a => a.rang_habituel != null)
    .sort((a, b) => (a.rang_habituel ?? 0) - (b.rang_habituel ?? 0) || a.rang - b.rang).map(a => a.id)
}

/** Arrêts dans l'ordre affiché : la feuille (`rang`), ou l'ordre calculé / manuel (non placés à la fin). */
export function arretsDansOrdre(arrets: ArretColis[], mode: OrdreMode): ArretColis[] {
  if (mode === 'feuille') return [...arrets].sort((a, b) => a.rang - b.rang)
  return [...arrets].sort((a, b) => (a.ordre ?? Number.MAX_SAFE_INTEGER) - (b.ordre ?? Number.MAX_SAFE_INTEGER) || a.rang - b.rang)
}

/** Arrêt mis en pause par le livreur et pas encore traité. */
export function estEnPause(a: Pick<ArretColis, 'statut' | 'en_pause_le'>): boolean {
  return !a.statut && !!a.en_pause_le
}

/** Premier arrêt non traité et pas en pause dans l'ordre affiché. */
export function prochainDansOrdre(arrets: ArretColis[], mode: OrdreMode): ArretColis | null {
  return arretsDansOrdre(arrets, mode).find(a => !a.statut && !a.en_pause_le) ?? null
}

/** Arrêts en pause, dans l'ordre de la tournée (affichés en haut de l'écran). */
export function arretsEnPause(arrets: ArretColis[], mode: OrdreMode): ArretColis[] {
  return arretsDansOrdre(arrets, mode).filter(estEnPause)
}

/** Numéro affiché sur la liste et la carte : rang de la feuille, ou place dans l'ordre. */
export function numeroAffiche(a: Pick<ArretColis, 'rang' | 'ordre'>, mode: OrdreMode): number | null {
  return mode === 'feuille' ? a.rang : (a.ordre ?? null)
}

export interface Groupe {
  cle: string
  commune: string
  cp: string | null
  /** Zone de la feuille de Brumath (« ZONE 3 ») : un groupe par zone, comme un village. */
  zone: string | null
  arrets: ArretColis[]
}

const sansAccent = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Un village, ou une zone de Brumath, = un bloc : même clé = même couleur sur la liste et la carte. */
export function cleGroupe(a: Pick<ArretColis, 'commune' | 'zone'>): string {
  return a.zone ? `${sansAccent(a.commune)}|${sansAccent(a.zone)}` : sansAccent(a.commune)
}

/** « Brumath · Zone 3 » ou « Kriegsheim ». */
export function libelleGroupe(commune: string, zone?: string | null): string {
  return zone ? `${commune} · ${zone.charAt(0)}${zone.slice(1).toLowerCase()}` : commune
}

/** Couleurs bien distinctes entre elles, lisibles sur fond clair et foncé. */
export const PALETTE_GROUPES = ['#e11d48', '#0891b2', '#7c3aed', '#ea580c', '#16a34a', '#db2777', '#2563eb', '#ca8a04', '#0d9488', '#9333ea', '#dc2626', '#4f46e5']

export interface InfoGroupe { cle: string; libelle: string; couleur: string; nb: number }

/** Une couleur par village / zone, dans l'ordre de la tournée (stable tant que l'ordre ne change pas de village). */
export function infosGroupes(arrets: ArretColis[], mode: OrdreMode): Map<string, InfoGroupe> {
  const out = new Map<string, InfoGroupe>()
  for (const a of arretsDansOrdre(arrets, mode)) {
    const cle = cleGroupe(a)
    const g = out.get(cle)
    if (g) g.nb++
    else out.set(cle, { cle, libelle: libelleGroupe(a.commune, a.zone), couleur: PALETTE_GROUPES[out.size % PALETTE_GROUPES.length], nb: 1 })
  }
  return out
}

/** Arrêts DÉJÀ ordonnés → groupes : un titre de commune à chaque changement de commune. */
export function grouperEnSuite(ordonnes: ArretColis[]): Groupe[] {
  const out: Groupe[] = []
  for (const a of ordonnes) {
    const d = out[out.length - 1]
    if (d && d.commune === a.commune && d.cp === a.cp && (d.zone ?? null) === (a.zone ?? null)) d.arrets.push(a)
    else out.push({ cle: `${a.commune}-${a.id}`, commune: a.commune, cp: a.cp, zone: a.zone ?? null, arrets: [a] })
  }
  return out
}

/** Liste du livreur : à faire groupés par commune dans l'ordre, traités à part (repliés en bas). */
export function sectionsListe(arrets: ArretColis[], mode: OrdreMode): { aFaire: Groupe[]; traites: ArretColis[] } {
  const o = arretsDansOrdre(arrets, mode)
  return { aFaire: grouperEnSuite(o.filter(a => !a.statut && !a.en_pause_le)), traites: o.filter(a => !!a.statut) }
}

/** Arrêts sans position (à placer sur la carte), non traités. */
export function arretsAPlacer(arrets: ArretColis[]): ArretColis[] {
  return arrets.filter(a => !a.statut && (a.lat == null || a.lng == null)).sort((a, b) => a.rang - b.rang)
}

/** Glisser-déposer : déplace l'élément `de` à la place `vers`. */
export function deplacer<T>(liste: T[], de: number, vers: number): T[] {
  if (de === vers || de < 0 || de >= liste.length) return [...liste]
  const out = [...liste]
  const [x] = out.splice(de, 1)
  out.splice(Math.max(0, Math.min(out.length, vers)), 0, x)
  return out
}

/** « Commencer par la fin » : les arrêts pas encore traités, dans l'ordre inverse de l'ordre affiché. */
export function ordreInverse(arrets: ArretColis[], mode: OrdreMode): string[] {
  return arretsDansOrdre(arrets, mode).filter(a => !a.statut).map(a => a.id).reverse()
}

/**
 * Les arrêts en pause sont cachés de la liste mais gardent leur place dans l'ordre : quand on réordonne les
 * arrêts visibles, chaque arrêt en pause est remis juste après celui qui le précédait (ou en tête). Pur.
 */
export function inclureEnPause(ancienOrdre: Array<{ id: string; enPause: boolean }>, nouveauVisible: string[]): string[] {
  const sortie = [...nouveauVisible]
  let ancre: string | null = null
  for (const a of ancienOrdre) {
    if (!a.enPause) { ancre = a.id; continue }
    if (sortie.includes(a.id)) continue
    const i = ancre == null ? -1 : sortie.indexOf(ancre)
    // Plusieurs arrêts en pause à la suite gardent leur ordre (chacun s'ancre sur le précédent).
    sortie.splice(i + 1, 0, a.id)
    ancre = a.id
  }
  return sortie
}

/** Ordre manuel complet à écrire : les traités gardent leur place (devant), puis les à-faire dans l'ordre choisi. */
export function ordreManuel(arrets: ArretColis[], mode: OrdreMode, aFaireIds: string[]): string[] {
  const traites = arretsDansOrdre(arrets, mode).filter(a => !!a.statut).map(a => a.id)
  const connus = new Set(arrets.map(a => a.id))
  return [...traites, ...aFaireIds.filter(id => connus.has(id) && !traites.includes(id))]
}

// ── Libellés ────────────────────────────────────────────────────────────────

/** « 45 min », « 2 h », « 3 h 40 ». */
export function libelleDuree(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—'
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60); const r = m % 60
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`
}

/** « 52 km », « 3,4 km », « 800 m ». */
export function libelleDistance(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—'
  if (m < 1000) return `${Math.round(m / 10) * 10} m`
  const km = m / 1000
  return `${(km < 10 ? Math.round(km * 10) / 10 : Math.round(km)).toLocaleString('fr-FR')} km`
}

export interface Bandeau {
  titre: string
  detail: string | null
  avertissement: string | null
}

/** Bandeau au-dessus de la liste : quel ordre, et ce qu'il vaut. */
export function bandeauOrdre(t: Pick<TourneeColis, 'ordre_mode' | 'trajet'>): Bandeau {
  const mode = modeOrdre(t)
  const tr = t.trajet
  if (mode === 'habituel') return { titre: 'Mon ordre habituel', detail: 'villages et rues dans ton ordre de tous les jours', avertissement: null }
  if (mode === 'feuille' || !tr) return { titre: 'Ordre de la feuille', detail: null, avertissement: null }
  const detail = `${libelleDistance(tr.km_total * 1000)} · ${libelleDuree(tr.duree_min)}`
  const gain = tr.km_feuille - tr.km_total
  return {
    titre: mode === 'manuel' ? 'Ordre manuel' : 'Ordre par la route',
    detail: mode === 'manuel' ? `calcul : ${detail}` : `${detail}${gain >= 1 ? ` · ${libelleDistance(gain * 1000)} de moins que la feuille` : ''}`,
    avertissement: tr.approximatif ? "Ordre approximatif : service d'itinéraire indisponible"
      : tr.trace_droit ? 'Ordre calculé sur les routes ; une partie du tracé est dessinée en ligne droite.' : null,
  }
}

/**
 * Heure de passage estimée (« 10:42 »). Base : l'heure de départ lue sur la feuille (calcul
 * complet), ou l'heure du calcul (recalcul depuis la position). null sans calcul.
 */
export function heurePassage(t: Pick<TourneeColis, 'date' | 'entete' | 'trajet'>, etaMin: number | null | undefined): string | null {
  if (etaMin == null || !t.trajet) return null
  let base: Date | null
  const dep = t.entete?.depart?.match(/^(\d{1,2})[:h](\d{2})/)
  if (t.trajet.mode === 'tout' && dep) {
    const [a, m, j] = t.date.split('-').map(Number)
    base = new Date(a, m - 1, j, Number(dep[1]), Number(dep[2]))
  } else {
    const c = new Date(t.trajet.calcule_a)
    base = Number.isNaN(c.getTime()) ? null : c
  }
  if (!base) return null
  const h = new Date(base.getTime() + etaMin * 60_000)
  return `${String(h.getHours()).padStart(2, '0')}:${String(h.getMinutes()).padStart(2, '0')}`
}

// ── Carte ───────────────────────────────────────────────────────────────────

export type EtatMarqueur = 'a_faire' | FamilleStatut

export interface PointCarte {
  cle: string
  lat: number
  lng: number
  /** Arrêts au même point, dans l'ordre affiché. */
  arrets: ArretColis[]
  numero: number | null
  etat: EtatMarqueur
  /** Pas encore placé dans l'ordre calculé (ajouté ou placé à la main après le calcul). */
  horsOrdre: boolean
  type: TypeArretColis
  prochain: boolean
  /** `cleGroupe` du premier arrêt : couleur du village / de la zone. */
  groupe: string
}

/** Arrêts → pastilles de la carte (même point = une pastille « ×n »). */
export function pointsCarte(arrets: ArretColis[], mode: OrdreMode, prochainId: string | null): PointCarte[] {
  const par = new Map<string, ArretColis[]>()
  for (const a of arretsDansOrdre(arrets, mode)) {
    if (a.lat == null || a.lng == null) continue
    const cle = `${a.lat.toFixed(5)},${a.lng.toFixed(5)}`
    par.set(cle, [...(par.get(cle) ?? []), a])
  }
  return [...par.entries()].map(([cle, liste]) => {
    const enCours = liste.find(a => !a.statut)
    const familles = liste.map(a => familleStatut(a.statut))
    const etat: EtatMarqueur = enCours ? 'a_faire'
      : familles.includes('retour') ? 'retour' : familles.includes('attente') ? 'attente'
        : familles.includes('livre') ? 'livre' : 'neutre'
    const premier = enCours ?? liste[0]
    return {
      cle, lat: liste[0].lat!, lng: liste[0].lng!, arrets: liste,
      numero: numeroAffiche(premier, mode),
      etat,
      horsOrdre: mode !== 'feuille' && !!enCours && liste.every(a => a.ordre == null),
      type: liste.some(a => a.type === 'rc') ? 'rc' : liste.some(a => a.type === 'col') ? 'col' : 'c',
      prochain: !!prochainId && liste.some(a => a.id === prochainId),
      groupe: cleGroupe(premier),
    }
  })
}

/** Index du point du tracé le plus proche d'une position (coupure fait / à faire). */
export function indexPlusProche(ligne: Array<[number, number]>, p: { lat: number; lng: number }): number {
  let best = 0; let d = Infinity
  ligne.forEach(([lat, lng], i) => {
    const e = (lat - p.lat) ** 2 + ((lng - p.lng) * Math.cos((p.lat * Math.PI) / 180)) ** 2
    if (e < d) { d = e; best = i }
  })
  return best
}

/** Tracé coupé au prochain arrêt : partie faite (estompée) et partie restante (pleine). */
export function couperTrace(ligne: Array<[number, number]>, prochain: { lat: number; lng: number } | null, toutFait: boolean) {
  if (!ligne.length) return { fait: [] as Array<[number, number]>, reste: [] as Array<[number, number]> }
  if (toutFait) return { fait: ligne, reste: [] }
  if (!prochain) return { fait: [], reste: ligne }
  const k = indexPlusProche(ligne, prochain)
  return { fait: ligne.slice(0, k + 1), reste: ligne.slice(k) }
}

/** Distance à vol d'oiseau (m). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000
  const rad = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

// ── Suivi en direct (lot 3) ─────────────────────────────────────────────────

/** Envoi de la position : toutes les 30 s, ou plus tôt après 150 m (jamais deux fois en 10 s). */
export function doitEnvoyerPosition(
  dernier: { t: number; lat: number; lng: number } | null,
  maintenant: number,
  p: { lat: number; lng: number },
): boolean {
  if (!dernier) return true
  const ecart = maintenant - dernier.t
  if (ecart >= 30_000) return true
  return ecart >= 10_000 && distanceM(dernier, p) >= 150
}

/** « à l'instant », « il y a 4 min », « il y a 2 h ». */
export function ilYA(iso: string, maintenant = Date.now()): string {
  const min = Math.floor((maintenant - new Date(iso).getTime()) / 60_000)
  if (!Number.isFinite(min) || min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  return `il y a ${Math.floor(min / 60)} h`
}

/** Une position de plus de 10 min est grisée sur la carte du bureau. */
export function positionAncienne(iso: string, maintenant = Date.now()): boolean {
  return maintenant - new Date(iso).getTime() > 10 * 60_000
}

// ── Clôture et comptage (lots 4 et 5) ───────────────────────────────────────

export interface ColisJournee {
  colis_domicile: number
  colis_relais: number
  colis_litige: number
  litige_raison: string | null
}

/**
 * Journée de colis déduite des arrêts d'une ou plusieurs tournées (même jour, même client) :
 * domicile / relais = colis remis ; litige = colis non remis (avisés, retours, non traités).
 * Les collectes ne comptent pas (ce ne sont pas des colis livrés).
 */
export function journeeDepuisArrets(arrets: ArretColis[]): ColisJournee {
  let dom = 0; let rel = 0; let lit = 0
  const raisons = new Map<string, number>()
  const noter = (k: string, n: number) => { if (n > 0) raisons.set(k, (raisons.get(k) ?? 0) + n) }
  for (const a of arrets) {
    if (a.type === 'col') continue
    const f = familleStatut(a.statut)
    if (f === 'neutre') continue
    const remis = f === 'livre' ? Math.min(a.quantite, a.colis_remis ?? a.quantite) : 0
    if (a.type === 'rc') rel += remis; else dom += remis
    const reste = a.quantite - remis
    if (reste <= 0) continue
    lit += reste
    noter(!a.statut ? 'Non traité' : f === 'livre' ? 'Livré en partie' : LIBELLE_STATUT_ARRET[a.statut as StatutArretColis], reste)
  }
  const litige_raison = raisons.size
    ? [...raisons.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).map(([k, n]) => `${k} ${n}`).join(' · ')
    : null
  return { colis_domicile: dom, colis_relais: rel, colis_litige: lit, litige_raison }
}

/** Ce qu'il reste avant de clôturer : arrêts non traités (avertissement, jamais bloquant). */
export function nonTraites(arrets: ArretColis[]): number {
  return arrets.filter(a => !a.statut).length
}

// ── Catégories (code couleur + avancement) ──────────────────────────────────

export interface CategorieArret {
  type: TypeArretColis
  libelle: string
  /** Variable CSS de la couleur de la catégorie. */
  couleur: string
  total: number
  traites: number
  colis: number
}

/** Classique = bleu · relais = violet · collecte = jaune ; seulement les catégories présentes. */
export const COULEUR_CATEGORIE: Record<TypeArretColis, string> = {
  c: 'var(--info)', rc: 'var(--accent-violet)', col: 'var(--warning)',
}
const LIBELLE_CATEGORIE: Record<TypeArretColis, string> = { c: 'Colis', rc: 'Relais', col: 'Collectes' }

export function avancementParCategorie(arrets: Array<Pick<ArretColis, 'type' | 'statut' | 'quantite'>>): CategorieArret[] {
  const out = (['c', 'rc', 'col'] as const).map(type => ({
    type, libelle: LIBELLE_CATEGORIE[type], couleur: COULEUR_CATEGORIE[type], total: 0, traites: 0, colis: 0,
  }))
  for (const a of arrets) {
    const c = out.find(x => x.type === a.type)
    if (!c) continue
    c.total++
    c.colis += a.quantite
    if (a.statut) c.traites++
  }
  return out.filter(c => c.total > 0)
}


// ── Zones sur la carte ──

type Pt = [number, number]

/** Enveloppe convexe (chaîne monotone) de points [lat, lng]. */
function enveloppeConvexe(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[1] - b[1] || a[0] - b[0])
  if (p.length < 3) return p
  const cross = (o: Pt, a: Pt, b: Pt) => (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1])
  const bas: Pt[] = []
  for (const q of p) { while (bas.length >= 2 && cross(bas[bas.length - 2], bas[bas.length - 1], q) <= 0) bas.pop(); bas.push(q) }
  const haut: Pt[] = []
  for (const q of [...p].reverse()) { while (haut.length >= 2 && cross(haut[haut.length - 2], haut[haut.length - 1], q) <= 0) haut.pop(); haut.push(q) }
  return [...bas.slice(0, -1), ...haut.slice(0, -1)]
}

/** Contour d'un village / d'une zone : enveloppe des arrêts, élargie de `rayonM` mètres tout autour. */
export function contourGroupe(points: Array<{ lat: number; lng: number }>, rayonM = 70): Pt[] {
  if (!points.length) return []
  const dLat = rayonM / 111_000
  const pad: Pt[] = []
  for (const q of points) {
    const dLng = dLat / Math.max(0.2, Math.cos((q.lat * Math.PI) / 180))
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * 2 * Math.PI
      pad.push([q.lat + dLat * Math.sin(t), q.lng + dLng * Math.cos(t)])
    }
  }
  return enveloppeConvexe(pad)
}

/**
 * Tracé de la route coupé par village / zone : chaque tronçon prend la couleur du groupe de l'arrêt
 * qu'il rejoint (recherche vers l'avant seulement : la route ne revient pas sur ses pas).
 * `ordonnes` = arrêts placés dans l'ordre du trajet.
 */
export function tracerParGroupe(ligne: Pt[], ordonnes: ArretColis[]): Array<{ cle: string; points: Pt[] }> {
  const places = ordonnes.filter(a => a.lat != null && a.lng != null)
  if (ligne.length < 2 || !places.length) return []
  const fenetre = Math.max(60, Math.ceil((8 * ligne.length) / places.length))
  const coupes: number[] = []
  let k = 0
  for (const a of places) {
    let best = k; let d = Infinity
    const fin = Math.min(ligne.length - 1, k + fenetre)
    for (let i = k; i <= fin; i++) {
      const e = (ligne[i][0] - a.lat!) ** 2 + ((ligne[i][1] - a.lng!) * Math.cos((a.lat! * Math.PI) / 180)) ** 2
      if (e < d) { d = e; best = i }
    }
    coupes.push(best); k = best
  }
  const out: Array<{ cle: string; points: Pt[] }> = []
  let debut = 0
  places.forEach((a, i) => {
    const cle = cleGroupe(a)
    const fin = i === places.length - 1 ? ligne.length - 1 : coupes[i]
    if (fin <= debut) return
    const morceau = ligne.slice(debut, fin + 1)
    const dernier = out[out.length - 1]
    if (dernier && dernier.cle === cle) dernier.points.push(...morceau.slice(1))
    else out.push({ cle, points: morceau })
    debut = fin
  })
  return out
}
