// Logique pure des Tournées : éligibilité, géocodage, carburant, navigation GPS,
// suivi des arrêts et cycle de vie. Aucune dépendance DB ni DOM.

import type { Tour, TourDelivery, Assignment } from './tournees.types'

/** Coût carburant par défaut, en centimes par km (0,15 €/km). */
export const DEFAULT_FUEL_CTS_PER_KM = 15

/** Une livraison est géocodée si elle a une latitude ET une longitude. */
export function isGeocoded(d: Pick<TourDelivery, 'delivery_lat' | 'delivery_lng'>): boolean {
  return d.delivery_lat != null && d.delivery_lng != null
}

/**
 * Estimation carburant indicative, en centimes.
 * total_km × coût/km (défaut 0,15 €/km = 15 cts/km). Arrondi au centime.
 */
export function estimateFuelCostCts(
  totalKm: number | null | undefined,
  ctsPerKm: number = DEFAULT_FUEL_CTS_PER_KM,
): number {
  if (!totalKm || totalKm <= 0) return 0
  return Math.round(totalKm * ctsPerKm)
}

// ── Navigation GPS (liens externes) ───────────────────────────────────────────
// Les constructeurs de liens ont demenage dans shared/lib/navigation.ts : la
// meme raison que `deplacerArret` — « Mes courses » en a besoin aussi, et les
// features sont etanches. Reexportes ici pour ne toucher a aucun appelant.
export {
  googleMapsStopUrl, wazeUrl, googleMapsAdresseUrl, wazeAdresseUrl,
  googleMapsRouteUrl,
} from '../../shared/lib/navigation'
export type { GeoPoint, OrderedStop, NavOptions } from '../../shared/lib/navigation'

// L'ordre impose a la main vit lui aussi dans shared/lib.
export { deplacerArret, planDeChargement } from '../../shared/lib/ordreArrets'

// ── Suivi des arrêts ──────────────────────────────────────────────────────────

/** Un arrêt est considéré livré dès que son statut est 'livree'. */
export function isDelivered(s: Pick<TourDelivery, 'statut'>): boolean {
  return s.statut === 'livree'
}

/** Compteur « X / N » d'arrêts livrés. */
export function deliveredProgress(stops: Pick<TourDelivery, 'statut'>[]): { delivered: number; total: number } {
  return { delivered: stops.filter(isDelivered).length, total: stops.length }
}

/** Reste-t-il au moins un arrêt non livré ? */
export function hasUndeliveredStops(stops: Pick<TourDelivery, 'statut'>[]): boolean {
  return stops.some(s => !isDelivered(s))
}

// ── Cycle de vie de la tournée ────────────────────────────────────────────────
// La règle a déménagé dans shared/lib/tourneeStatuts.ts : « Mes courses » doit
// pouvoir démarrer et terminer la tournée depuis le téléphone, et les features
// sont étanches. Réexportée ici pour ne toucher à aucun appelant existant.
export { canStartTour, canFinishTour } from '../../shared/lib/tourneeStatuts'

// ── Multi-véhicule (dispatch) ─────────────────────────────────────────────────

/** Sous-ensemble géocodé d'un pool de livraisons (réutilise isGeocoded). */
export function geocodedPool(deliveries: TourDelivery[]): TourDelivery[] {
  return deliveries.filter(isGeocoded)
}

/**
 * Le dispatch est possible s'il y a au moins une affectation véhicule
 * ET au moins une livraison géocodée dans le pool.
 */
export function canDispatch(assignments: Assignment[], pool: TourDelivery[]): boolean {
  return assignments.length >= 1 && geocodedPool(pool).length >= 1
}

/** Compare deux stop_order, null en dernier. */
function byStopOrder(a: TourDelivery, b: TourDelivery): number {
  if (a.stop_order == null && b.stop_order == null) return 0
  if (a.stop_order == null) return 1
  if (b.stop_order == null) return -1
  return a.stop_order - b.stop_order
}

/**
 * Regroupe chaque tournée avec ses livraisons (tour_id), triées par stop_order
 * croissant (null en dernier). Les tournées conservent l'ordre du tableau reçu.
 */
export function groupToursWithStops(
  tours: Tour[],
  deliveries: TourDelivery[],
): Array<{ tour: Tour; stops: TourDelivery[] }> {
  return tours.map(tour => ({
    tour,
    stops: deliveries.filter(d => d.tour_id === tour.id).sort(byStopOrder),
  }))
}

/** Somme des distances/durées sur plusieurs tournées (ignore les valeurs null). */
export function totalsAcrossTours(
  tours: Array<Pick<Tour, 'total_km' | 'total_duration_min'>>,
): { totalKm: number; totalMin: number } {
  return tours.reduce(
    (acc, t) => ({
      totalKm: acc.totalKm + (t.total_km ?? 0),
      totalMin: acc.totalMin + (t.total_duration_min ?? 0),
    }),
    { totalKm: 0, totalMin: 0 },
  )
}

// ── Courses en retard (lot P3) ────────────────────────────────────────────────
// Une course `planifiee` ou `en_cours` d'une date passée n'a pas disparu : elle
// reste à faire. Le pool les reprend, signalées, pour qu'on puisse les remettre
// dans la tournée du jour (ce qui replanifie leur date).

/** Statuts d'une course encore à faire sur la route. */
export const STATUTS_A_FAIRE = ['planifiee', 'en_cours'] as const

/** Course lue avec le statut de sa tournée éventuelle (jointure `tours`). */
export type TourDeliveryAvecTournee = TourDelivery & { tours?: { status: string } | null }

/** Vrai si la course est datée avant `dateReference` (AAAA-MM-JJ, comparaison de chaînes). */
export function estEnRetard(d: Pick<TourDelivery, 'date'>, dateReference: string): boolean {
  return !!d.date && d.date < dateReference
}

/**
 * Garde les vraies courses en retard : datées avant `aujourdHui`, encore à faire,
 * et pas rattachées à une tournée terminée (une tournée terminée est close : ce
 * qui n'y a pas été livré relève de l'échec / relivraison, pas d'une reprise
 * silencieuse). Tri : la plus ancienne d'abord.
 */
export function coursesEnRetard(
  lignes: TourDeliveryAvecTournee[],
  aujourdHui: string,
): TourDelivery[] {
  return lignes
    .filter(d =>
      estEnRetard(d, aujourdHui)
      && (STATUTS_A_FAIRE as readonly string[]).includes(d.statut)
      && d.tours?.status !== 'terminee')
    .map(({ tours: _tours, ...d }) => d) // eslint-disable-line @typescript-eslint/no-unused-vars
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** Pool final : retards d'abord (plus ancien en tête), puis les courses du jour. Sans doublon. */
export function fusionnerPool(duJour: TourDelivery[], retards: TourDelivery[]): TourDelivery[] {
  const vus = new Set<string>()
  const out: TourDelivery[] = []
  for (const d of [...retards, ...duJour]) {
    if (vus.has(d.id)) continue
    vus.add(d.id)
    out.push(d)
  }
  return out
}

/** « En retard (JJ/MM) » à partir d'une date AAAA-MM-JJ. */
export function libelleRetard(date: string): string {
  const [, m, j] = date.split('-')
  return `En retard (${j}/${m})`
}

/** Lit `?date=AAAA-MM-JJ` ; null si absent ou invalide (date inexistante comprise). */
export function dateDepuisParam(v: string | null | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const [a, m, j] = v.split('-').map(Number)
  const d = new Date(a, m - 1, j)
  if (d.getFullYear() !== a || d.getMonth() !== m - 1 || d.getDate() !== j) return null
  return v
}

// ── Heures de tournée → Heures (lot P3) ───────────────────────────────────────
// `tours` ne stocke pas d'heure de démarrage. Meilleure approximation sans
// migration : `updated_at` d'une tournée EN COURS, posé par le trigger au
// passage en `en_cours` (faux si la tournée a été modifiée depuis, d'où une
// suggestion modifiable, jamais une écriture silencieuse).

/** HH:MM locale d'un horodatage ISO. */
export function heureLocale(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** AAAA-MM-JJ locale d'un horodatage ISO. */
function dateLocale(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Heure de début suggérée : `updated_at` d'une tournée en cours, s'il tombe le
 * jour de la tournée. Sinon null (l'utilisateur saisit le début).
 */
export function debutTourneeSuggere(
  tour: Pick<Tour, 'status' | 'updated_at' | 'date'>,
): string | null {
  if (tour.status !== 'en_cours' || !tour.updated_at) return null
  if (Number.isNaN(new Date(tour.updated_at).getTime())) return null
  if (dateLocale(tour.updated_at) !== tour.date) return null
  return heureLocale(tour.updated_at)
}

/** Ligne `work_hours` à insérer (colonnes existantes en prod). */
export interface LigneHeuresTournee {
  company_id: string
  member_id: string
  date: string
  start_time: string
  end_time: string
  break_minutes: number
  delivery_id: null
  notes: string
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Construit la ligne d'heures du chauffeur pour une tournée terminée.
 * Refuse une heure mal formée ou une fin ≤ début (la colonne calculée
 * `total_minutes` deviendrait négative).
 */
export function construireLigneHeures(p: {
  companyId: string
  memberId: string
  date: string
  debut: string
  fin: string
  libelleTournee?: string
}): { ligne: LigneHeuresTournee } | { erreur: string } {
  if (!HHMM.test(p.debut)) return { erreur: 'Heure de début invalide (HH:MM).' }
  if (!HHMM.test(p.fin)) return { erreur: 'Heure de fin invalide (HH:MM).' }
  if (p.fin <= p.debut) return { erreur: 'La fin doit être après le début.' }
  return {
    ligne: {
      company_id: p.companyId,
      member_id: p.memberId,
      date: p.date,
      start_time: p.debut,
      end_time: p.fin,
      break_minutes: 0,
      delivery_id: null,
      notes: p.libelleTournee ? `Tournée ${p.libelleTournee}` : 'Tournée',
    },
  }
}

/** Une ligne d'heures existe-t-elle déjà pour ce chauffeur à cette date ? */
export function aDejaDesHeures(
  lignes: Array<{ member_id: string; date: string }>,
  memberId: string,
  date: string,
): boolean {
  return lignes.some(l => l.member_id === memberId && l.date === date)
}

// ── Affectations existantes (lot T1, revue 04a) ──────────────────────────────

type CourseAffectee = Pick<TourDelivery, 'id' | 'vehicle_id' | 'driver_id'>

/**
 * Véhicules à cocher et chauffeur par véhicule à l'ouverture d'une date :
 * d'abord les tournées déjà composées, puis les affectations posées sur les
 * courses du jour (Planning, fiche). Une seule saisie : on reprend, on ne
 * redemande pas. Si plusieurs chauffeurs sont posés sur un même véhicule, le
 * plus fréquent l'emporte.
 */
export function affectationsSuggerees(
  tours: Array<Pick<Tour, 'vehicle_id' | 'driver_id'>>,
  courses: CourseAffectee[],
): { vehicules: string[]; chauffeurParVehicule: Record<string, string> } {
  const vehicules: string[] = []
  const chauffeurParVehicule: Record<string, string> = {}
  for (const t of tours) {
    if (!t.vehicle_id) continue
    if (!vehicules.includes(t.vehicle_id)) vehicules.push(t.vehicle_id)
    if (t.driver_id && !chauffeurParVehicule[t.vehicle_id]) chauffeurParVehicule[t.vehicle_id] = t.driver_id
  }
  const compte = new Map<string, Map<string, number>>()
  for (const c of courses) {
    if (!c.vehicle_id) continue
    if (!vehicules.includes(c.vehicle_id)) vehicules.push(c.vehicle_id)
    if (!c.driver_id) continue
    const m = compte.get(c.vehicle_id) ?? new Map<string, number>()
    m.set(c.driver_id, (m.get(c.driver_id) ?? 0) + 1)
    compte.set(c.vehicle_id, m)
  }
  for (const [vid, m] of compte) {
    if (chauffeurParVehicule[vid]) continue
    const [meilleur] = [...m.entries()].sort((a, b) => b[1] - a[1])
    if (meilleur) chauffeurParVehicule[vid] = meilleur[0]
  }
  return { vehicules, chauffeurParVehicule }
}

/**
 * Courses dont le chauffeur ou le véhicule DÉJÀ posé va être remplacé par la
 * répartition (à dire avant de cliquer, jamais en silence).
 * - « mon ordre » (un véhicule, un chauffeur) : toute affectation différente ;
 * - « optimiser » : une affectation hors des véhicules / chauffeurs choisis
 *   (entre véhicules choisis, c'est justement le travail de l'optimiseur).
 */
export function affectationsEcrasees(
  courses: CourseAffectee[],
  assignments: Assignment[],
  mode: 'ordre' | 'optimiser',
): CourseAffectee[] {
  const vehicules = new Set(assignments.map(a => a.vehicle_id))
  const chauffeurs = new Set(assignments.map(a => a.driver_id).filter((d): d is string => !!d))
  if (mode === 'ordre') {
    const a = assignments[0]
    if (!a) return []
    return courses.filter(c =>
      (c.vehicle_id != null && c.vehicle_id !== a.vehicle_id)
      || (c.driver_id != null && c.driver_id !== a.driver_id))
  }
  return courses.filter(c =>
    (c.vehicle_id != null && !vehicules.has(c.vehicle_id))
    || (c.driver_id != null && !chauffeurs.has(c.driver_id)))
}

// ── Gérer une tournée (lot T2) ───────────────────────────────────────────────

/**
 * Ce qu'on écrit sur la tournée quand on en retire une course : distance,
 * durée et tracé ne valent plus (un chiffre faux est pire qu'un tiret) ; une
 * tournée optimisée redevient brouillon, une tournée en cours le reste.
 */
export function majTourneeApresRetrait(status: Tour['status']): Partial<Tour> {
  const vide = { total_km: null, total_duration_min: null, geometry: null, optimized_at: null }
  return status === 'en_cours' ? vide : { ...vide, status: 'brouillon' }
}

/** Une course se retire d'une tournée tant qu'elle n'est pas livrée et que la tournée n'est pas terminée. */
export function peutRetirerArret(tourStatus: Tour['status'], s: Pick<TourDelivery, 'statut'>): boolean {
  return tourStatus !== 'terminee' && !isDelivered(s)
}

/** Une tournée se supprime si elle n'a pas démarré et qu'aucun arrêt n'est livré. */
export function peutSupprimerTournee(tourStatus: Tour['status'], stops: Pick<TourDelivery, 'statut'>[]): boolean {
  return (tourStatus === 'brouillon' || tourStatus === 'optimisee') && !stops.some(isDelivered)
}
