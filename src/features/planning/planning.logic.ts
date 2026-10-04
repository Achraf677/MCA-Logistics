// Planning — logique pure (sans DB ni DOM), testée dans planning.logic.test.ts.

import { alertesAffectation } from '../../shared/lib/documentsAffectation'
import { toLocalISO } from '../../shared/lib/dates'
import { heureCourte, libelleCreneau } from '../livraisons/livraisons.logic'
import type {
  CoursePlanning, ChauffeurPlanning, VehiculePlanning, LigneRessource,
  FiltreATraiter, CompteursATraiter, CibleDeplacement,
} from './planning.types'

// ── Semaine ──────────────────────────────────────────────────────────────────

/** Les 7 jours (lundi → dimanche) de la semaine qui contient `ancre`. */
export function joursDeLaSemaine(ancre: Date): Date[] {
  const d = new Date(ancre.getFullYear(), ancre.getMonth(), ancre.getDate())
  const jour = d.getDay()
  d.setDate(d.getDate() + (jour === 0 ? -6 : 1 - jour))
  return Array.from({ length: 7 }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + i))
}

/** 'AAAA-MM-JJ' → Date locale (minuit), sans passer par UTC. */
export function dateLocale(iso: string): Date {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number)
  return new Date(a, m - 1, j)
}

// ── Statuts ──────────────────────────────────────────────────────────────────

const OUVERTS = new Set(['planifiee', 'en_cours'])
const FIGES = new Set(['facturee', 'payee', 'annulee'])

/** Course encore à faire (planifiée / en cours). */
export function estOuverte(statut: string): boolean {
  return OUVERTS.has(statut)
}

/** Une course facturée, payée ou annulée ne se déplace plus depuis le Planning. */
export function estDeplacable(statut: string): boolean {
  return !FIGES.has(statut)
}

// ── Vue par ressource ────────────────────────────────────────────────────────

/**
 * Lignes chauffeurs × jours. « Non affecté » en tête (toujours présent), puis
 * les chauffeurs (rôle chauffeur), puis toute autre personne de l'équipe à qui
 * une course de la semaine est affectée (ex. le président qui roule). Une
 * course hors de la semaine affichée est ignorée.
 */
export function grouperParChauffeur(
  courses: CoursePlanning[],
  jours: string[],
  equipe: Pick<ChauffeurPlanning, 'id' | 'full_name' | 'role'>[],
): LigneRessource[] {
  const vide = () => Object.fromEntries(jours.map(j => [j, [] as CoursePlanning[]]))
  const lignes = new Map<string, LigneRessource>()
  const nonAffecte: LigneRessource = { driverId: null, nom: 'Non affecté', cellules: vide(), total: 0 }

  for (const m of equipe) {
    if (m.role === 'chauffeur') lignes.set(m.id, { driverId: m.id, nom: m.full_name, cellules: vide(), total: 0 })
  }
  const autres: LigneRessource[] = []
  for (const c of courses) {
    if (!jours.includes(c.date)) continue
    let ligne = nonAffecte
    if (c.driver_id) {
      let l = lignes.get(c.driver_id)
      if (!l) {
        const nom = equipe.find(m => m.id === c.driver_id)?.full_name ?? c.team_members?.full_name ?? 'Chauffeur'
        l = { driverId: c.driver_id, nom, cellules: vide(), total: 0 }
        lignes.set(c.driver_id, l)
        autres.push(l)
      }
      ligne = l
    }
    ligne.cellules[c.date].push(c)
    ligne.total++
  }
  const chauffeurs = [...lignes.values()].filter(l => !autres.includes(l))
  return [nonAffecte, ...chauffeurs, ...autres.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))]
}

/** Courses par jour (vue « Par jour » et mobile). */
export function grouperParJour(courses: CoursePlanning[], jours: string[]): Record<string, CoursePlanning[]> {
  const parJour = Object.fromEntries(jours.map(j => [j, [] as CoursePlanning[]]))
  for (const c of courses) parJour[c.date]?.push(c)
  return parJour
}

// ── Bandeau « À traiter » ────────────────────────────────────────────────────

/** La course relève-t-elle de ce filtre « À traiter » ? (courses ouvertes seulement) */
export function correspondAuFiltre(c: CoursePlanning, filtre: FiltreATraiter, aujourdhui: string): boolean {
  if (!estOuverte(c.statut)) return false
  switch (filtre) {
    case 'sans_chauffeur': return !c.driver_id
    case 'sans_vehicule':  return !c.vehicle_id
    case 'non_localisee':  return c.delivery_lat == null
    case 'echecs':         return !!c.probleme_le
    case 'retard':         return c.date < aujourdhui
  }
}

/**
 * Compteurs du bandeau : sur la semaine affichée, sauf « en retard » qui
 * vient d'une requête dédiée (toutes dates passées).
 */
export function compteursATraiter(
  semaine: CoursePlanning[], enRetard: CoursePlanning[], aujourdhui: string,
): CompteursATraiter {
  const n = (f: FiltreATraiter) => semaine.filter(c => correspondAuFiltre(c, f, aujourdhui)).length
  return {
    sans_chauffeur: n('sans_chauffeur'),
    sans_vehicule:  n('sans_vehicule'),
    non_localisee:  n('non_localisee'),
    echecs:         n('echecs'),
    retard:         enRetard.filter(c => correspondAuFiltre(c, 'retard', aujourdhui)).length,
  }
}

// ── Cartes ───────────────────────────────────────────────────────────────────

/** Créneau de livraison saisi, sinon heure calculée par la tournée ; null si rien. */
export function creneauCarte(c: Pick<CoursePlanning,
  'creneau_livraison_debut' | 'creneau_livraison_fin' | 'arrival_time'>): string | null {
  return libelleCreneau(c.creneau_livraison_debut, c.creneau_livraison_fin)
    ?? (heureCourte(c.arrival_time) ? `vers ${heureCourte(c.arrival_time)}` : null)
}

// ── Déplacement ──────────────────────────────────────────────────────────────

/**
 * Courses qui changent vraiment avec cette cible (les autres sont ignorées),
 * et celles d'entre elles à détacher de leur tournée.
 */
export function aDeplacer(courses: CoursePlanning[], cible: CibleDeplacement) {
  const bouge = courses.filter(c => estDeplacable(c.statut) && (
    (cible.driverId !== undefined && (c.driver_id ?? null) !== cible.driverId)
    || (cible.date !== undefined && c.date !== cible.date)))
  return { ids: bouge.map(c => c.id), aDetacher: bouge.filter(c => !!c.tour_id).map(c => c.id) }
}

/** Mise à jour optimiste : applique la cible aux courses `ids` (nom du chauffeur compris). */
export function appliquerDeplacement(
  courses: CoursePlanning[], ids: string[], cible: CibleDeplacement, nomChauffeur: string | null,
): CoursePlanning[] {
  const set = new Set(ids)
  return courses.map(c => {
    if (!set.has(c.id)) return c
    const n: CoursePlanning = { ...c }
    if (cible.driverId !== undefined) {
      n.driver_id = cible.driverId
      n.team_members = cible.driverId && nomChauffeur ? { full_name: nomChauffeur } : null
    }
    if (cible.date !== undefined) n.date = cible.date
    if (c.tour_id) { n.tour_id = null; n.stop_order = null; n.arrival_time = null }
    return n
  })
}

// ── Contrôle des documents ───────────────────────────────────────────────────

// La règle vit dans shared/lib/documentsAffectation (partagée avec Tournées).
export { alertesAffectation } from '../../shared/lib/documentsAffectation'

/** Alertes de toutes les courses déplacées, sans doublon. */
export function alertesDeplacement(
  courses: CoursePlanning[], cible: CibleDeplacement,
  equipe: ChauffeurPlanning[], vehicules: VehiculePlanning[],
): string[] {
  const toutes = new Set<string>()
  for (const c of courses) {
    const driverId = cible.driverId !== undefined ? cible.driverId : c.driver_id
    const chauffeur = driverId ? equipe.find(m => m.id === driverId) : null
    const vehicule = c.vehicle_id ? vehicules.find(v => v.id === c.vehicle_id) : null
    for (const a of alertesAffectation(chauffeur, vehicule, cible.date ?? c.date)) toutes.add(a)
  }
  return [...toutes]
}

/** Aujourd'hui en 'AAAA-MM-JJ' local. */
export function aujourdhuiIso(): string {
  return toLocalISO(new Date())
}
