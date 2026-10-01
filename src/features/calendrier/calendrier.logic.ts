/**
 * Calendrier (vue mois) — logique pure, sans React ni Supabase.
 * - grille du mois (lundi en premier) ;
 * - agrégation des courses par jour (nombre, sans chauffeur, urgentes, ville d'arrivée) ;
 * - marqueurs d'échéances flotte (véhicules + entretiens) et équipe (permis, visite médicale).
 */
import { computeEcheance } from '../../shared/lib/echeances'
import type { EcheanceStatus } from '../../shared/lib/echeances'
import { toLocalISO } from '../../shared/lib/dates'

// ─── Grille du mois ─────────────────────────────────────────────────────────

/** Semaines du mois (lundi → dimanche), `null` pour les cases hors mois. */
export function grilleDuMois(annee: number, mois: number): (Date | null)[][] {
  const premier = new Date(annee, mois, 1)
  const dernier = new Date(annee, mois + 1, 0)
  const decalage = premier.getDay() === 0 ? 6 : premier.getDay() - 1

  const semaines: (Date | null)[][] = []
  let semaine: (Date | null)[] = Array(decalage).fill(null)
  for (let j = 1; j <= dernier.getDate(); j++) {
    semaine.push(new Date(annee, mois, j))
    if (semaine.length === 7) { semaines.push(semaine); semaine = [] }
  }
  if (semaine.length > 0) {
    while (semaine.length < 7) semaine.push(null)
    semaines.push(semaine)
  }
  return semaines
}

// ─── Courses ────────────────────────────────────────────────────────────────

/** Le minimum d'une course lu par le calendrier (sous-ensemble de DeliveryRow). */
export interface CourseSource {
  id: string
  date: string
  driver_id: string | null
  delivery_address: string | null
  urgent?: boolean | null
  statut: string
  prestation?: string | null
  clients?: { name: string | null } | null
}

/**
 * Relevés de messagerie et forfaits : pas des courses « sur la route »
 * (ni arrêt ni chauffeur) → jamais dans le calendrier (CLAUDE.md § 2).
 */
export function estSurLaRoute(c: Pick<CourseSource, 'prestation'>): boolean {
  return c.prestation !== 'messagerie' && c.prestation !== 'forfait'
}

/**
 * Ville d'arrivée lue dans l'adresse saisie : le mot après le code postal
 * (« 12 rue X, 67000 Strasbourg » → « Strasbourg »), sinon le dernier segment
 * après une virgule (hors « France »). Rien d'exploitable → null.
 */
export function villeDepuisAdresse(adresse: string | null | undefined): string | null {
  const a = (adresse ?? '').trim()
  if (!a) return null
  const cp = a.match(/\b\d{5}\s+([^,\d][^,]*)/)
  if (cp) return nettoyerVille(cp[1])
  const segments = a.split(',').map(s => s.trim()).filter(s => s && !/^france$/i.test(s))
  if (segments.length < 2) return null
  return nettoyerVille(segments[segments.length - 1])
}

function nettoyerVille(v: string): string | null {
  const s = v.replace(/\s+france$/i, '').replace(/\s+/g, ' ').trim()
  return s || null
}

/** Ce qu'une case du calendrier affiche pour une course. */
export interface CourseCase {
  id: string
  client: string
  ville: string | null
  urgent: boolean
  sansChauffeur: boolean
  annulee: boolean
}

export interface CoursesDuJour {
  courses: CourseCase[]
  /** Courses comptées (hors annulées). */
  nb: number
  nbSansChauffeur: number
  nbUrgentes: number
}

/**
 * Regroupe les courses par date (clé AAAA-MM-JJ). Les relevés de messagerie et
 * forfaits sont écartés. Les annulées restent visibles (barrées) mais ne
 * comptent pas ; « sans chauffeur » ne concerne que les courses encore à faire
 * (planifiée / en cours). Tri : urgentes, puis sans chauffeur, puis client.
 */
export function coursesParJour(rows: CourseSource[]): Map<string, CoursesDuJour> {
  const parJour = new Map<string, CoursesDuJour>()
  for (const r of rows) {
    if (!estSurLaRoute(r) || !r.date) continue
    const annulee = r.statut === 'annulee'
    const aFaire = r.statut === 'planifiee' || r.statut === 'en_cours'
    const c: CourseCase = {
      id: r.id,
      client: r.clients?.name?.trim() || 'Client ?',
      ville: villeDepuisAdresse(r.delivery_address),
      urgent: !annulee && !!r.urgent,
      sansChauffeur: aFaire && !r.driver_id,
      annulee,
    }
    let jour = parJour.get(r.date)
    if (!jour) { jour = { courses: [], nb: 0, nbSansChauffeur: 0, nbUrgentes: 0 }; parJour.set(r.date, jour) }
    jour.courses.push(c)
    if (!annulee) jour.nb++
    if (c.sansChauffeur) jour.nbSansChauffeur++
    if (c.urgent) jour.nbUrgentes++
  }
  for (const jour of parJour.values()) {
    jour.courses.sort((a, b) =>
      Number(a.annulee) - Number(b.annulee)
      || Number(b.urgent) - Number(a.urgent)
      || Number(b.sansChauffeur) - Number(a.sansChauffeur)
      || a.client.localeCompare(b.client, 'fr'))
  }
  return parJour
}

/** Coupe une liste pour une case : `max` éléments visibles + le reste (« +N »). */
export function tronquer<T>(liste: T[], max: number): { visibles: T[]; reste: number } {
  if (liste.length <= max) return { visibles: liste, reste: 0 }
  // Pas de « +1 » : autant montrer l'élément.
  const n = Math.max(0, max - 1)
  return { visibles: liste.slice(0, n), reste: liste.length - n }
}

// ─── Échéances ──────────────────────────────────────────────────────────────

export type DomaineEcheance = 'vehicule' | 'equipe'
export type CategorieEcheance =
  | 'assurance' | 'controle_technique' | 'revision' | 'entretien'
  | 'permis' | 'visite_medicale'

export const LIBELLE_CATEGORIE: Record<CategorieEcheance, string> = {
  assurance: 'Assurance',
  controle_technique: 'Contrôle technique',
  revision: 'Révision',
  entretien: 'Entretien',
  permis: 'Permis B',
  visite_medicale: 'Visite médicale',
}

export interface MarqueurEcheance {
  cle: string
  date: string
  domaine: DomaineEcheance
  categorie: CategorieEcheance
  /** « Contrôle technique », « Vidange »… */
  libelle: string
  /** Véhicule (« Master 1 · AB-123-CD ») ou membre d'équipe. */
  sujet: string
  statut: EcheanceStatus
}

/** Colonnes réelles de `vehicles` lues par le calendrier. */
export interface VehiculeEcheanceSource {
  id: string
  label: string
  plate: string | null
  status: string | null
  ct_expiry: string | null
  insurance_expiry: string | null
  next_revision_date: string | null
}

/** Colonnes réelles de `vehicle_maintenances` lues par le calendrier. */
export interface EntretienEcheanceSource {
  id: string
  vehicle_id: string
  type: string | null
  date: string
  next_due_date: string | null
}

/** Colonnes réelles de `team_members` lues par le calendrier. */
export interface MembreEcheanceSource {
  id: string
  full_name: string
  active: boolean | null
  licence_b_expiry: string | null
  medical_visit_expiry: string | null
}

const LIBELLE_TYPE_ENTRETIEN: Record<string, string> = {
  vidange: 'Vidange', pneus: 'Pneus', freins: 'Freins', controle_technique: 'Contrôle technique',
  revision: 'Révision', reparation: 'Réparation', inspection: 'Inspection', autre: 'Entretien',
}

function categorieEntretien(type: string | null): CategorieEcheance {
  if (type === 'controle_technique') return 'controle_technique'
  if (type === 'revision') return 'revision'
  return 'entretien'
}

function dansLaPeriode(date: string | null, debut: string, fin: string): date is string {
  return !!date && date >= debut && date <= fin
}

function sujetVehicule(v: Pick<VehiculeEcheanceSource, 'label' | 'plate'> | undefined): string {
  if (!v) return 'Véhicule'
  return v.plate && v.plate !== v.label ? `${v.label} · ${v.plate}` : v.label
}

/**
 * Échéances flotte et équipe tombant entre `debut` et `fin` (AAAA-MM-JJ inclus).
 * - Véhicules : assurance, CT, révision (fiche véhicule) — hors véhicules inactifs.
 * - Entretiens : `next_due_date` du DERNIER entretien de chaque (véhicule, type) —
 *   un entretien plus récent remplace la prochaine échéance de l'ancien.
 *   Doublon avec la fiche véhicule (même véhicule, même catégorie, même jour) : un seul marqueur.
 * - Équipe : permis B, visite médicale — membres actifs uniquement.
 * Statut (dépassé / bientôt / ok) via `shared/lib/echeances.ts` (seuil 30 j).
 */
export function construireEcheances(
  sources: {
    vehicules: VehiculeEcheanceSource[]
    entretiens: EntretienEcheanceSource[]
    membres: MembreEcheanceSource[]
  },
  debut: string,
  fin: string,
  aujourdhui: Date = new Date(),
): MarqueurEcheance[] {
  const out: MarqueurEcheance[] = []
  const vus = new Set<string>()
  const statut = (d: string) => computeEcheance(`${d}T00:00:00`, aujourdhui).status
  const ajouter = (m: Omit<MarqueurEcheance, 'statut' | 'cle'>, idSujet: string) => {
    const cle = `${m.domaine}|${idSujet}|${m.categorie}|${m.libelle}|${m.date}`
    if (vus.has(cle)) return
    vus.add(cle)
    out.push({ ...m, cle, statut: statut(m.date) })
  }

  const actifs = new Map<string, VehiculeEcheanceSource>()
  for (const v of sources.vehicules) {
    if (v.status === 'inactive') continue
    actifs.set(v.id, v)
    const champs: Array<[string | null, CategorieEcheance]> = [
      [v.insurance_expiry, 'assurance'],
      [v.ct_expiry, 'controle_technique'],
      [v.next_revision_date, 'revision'],
    ]
    for (const [date, categorie] of champs) {
      if (!dansLaPeriode(date, debut, fin)) continue
      ajouter({ date, domaine: 'vehicule', categorie, libelle: LIBELLE_CATEGORIE[categorie], sujet: sujetVehicule(v) }, v.id)
    }
  }

  // Dernier entretien par (véhicule, type).
  const dernier = new Map<string, EntretienEcheanceSource>()
  for (const e of sources.entretiens) {
    const k = `${e.vehicle_id}|${e.type ?? 'autre'}`
    const prec = dernier.get(k)
    if (!prec || e.date > prec.date) dernier.set(k, e)
  }
  for (const e of dernier.values()) {
    if (!dansLaPeriode(e.next_due_date, debut, fin)) continue
    const v = actifs.get(e.vehicle_id)
    if (!v) continue // véhicule inactif ou inconnu
    const categorie = categorieEntretien(e.type)
    const libelle = categorie === 'entretien'
      ? (LIBELLE_TYPE_ENTRETIEN[e.type ?? 'autre'] ?? 'Entretien')
      : LIBELLE_CATEGORIE[categorie]
    ajouter({ date: e.next_due_date, domaine: 'vehicule', categorie, libelle, sujet: sujetVehicule(v) }, v.id)
  }

  for (const m of sources.membres) {
    if (m.active === false) continue
    const champs: Array<[string | null, CategorieEcheance]> = [
      [m.licence_b_expiry, 'permis'],
      [m.medical_visit_expiry, 'visite_medicale'],
    ]
    for (const [date, categorie] of champs) {
      if (!dansLaPeriode(date, debut, fin)) continue
      ajouter({ date, domaine: 'equipe', categorie, libelle: LIBELLE_CATEGORIE[categorie], sujet: m.full_name }, m.id)
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.sujet.localeCompare(b.sujet, 'fr'))
}

/** Échéances regroupées par date. */
export function echeancesParJour(marqueurs: MarqueurEcheance[]): Map<string, MarqueurEcheance[]> {
  const parJour = new Map<string, MarqueurEcheance[]>()
  for (const m of marqueurs) {
    const l = parJour.get(m.date)
    if (l) l.push(m)
    else parJour.set(m.date, [m])
  }
  return parJour
}

/** Statut le plus grave d'une liste (dépassé > bientôt > ok). */
export function statutLePlusGrave(marqueurs: MarqueurEcheance[]): EcheanceStatus {
  if (marqueurs.some(m => m.statut === 'overdue')) return 'overdue'
  if (marqueurs.some(m => m.statut === 'soon')) return 'soon'
  return marqueurs.length ? 'ok' : 'none'
}

/** Texte d'info-bulle d'un jour : une ligne par échéance. */
export function infoBulleEcheances(marqueurs: MarqueurEcheance[]): string {
  return marqueurs.map(m => `${m.libelle} — ${m.sujet}`).join('\n')
}

// ─── Filtre ─────────────────────────────────────────────────────────────────

export type FiltreCalendrier = 'tout' | 'courses' | 'echeances'

export function montreCourses(f: FiltreCalendrier): boolean { return f !== 'echeances' }
export function montreEcheances(f: FiltreCalendrier): boolean { return f !== 'courses' }

/** Jours du mois ayant quelque chose à montrer (vue mobile en liste), triés. */
export function joursAvecContenu(
  annee: number, mois: number,
  courses: Map<string, CoursesDuJour>,
  echeances: Map<string, MarqueurEcheance[]>,
  filtre: FiltreCalendrier,
): string[] {
  const dernier = new Date(annee, mois + 1, 0).getDate()
  const jours: string[] = []
  for (let j = 1; j <= dernier; j++) {
    const cle = toLocalISO(new Date(annee, mois, j))
    const aCourses = montreCourses(filtre) && (courses.get(cle)?.courses.length ?? 0) > 0
    const aEcheances = montreEcheances(filtre) && (echeances.get(cle)?.length ?? 0) > 0
    if (aCourses || aEcheances) jours.push(cle)
  }
  return jours
}
