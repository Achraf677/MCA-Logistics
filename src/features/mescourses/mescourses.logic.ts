// Logique pure de l'écran « Mes courses » — aucune dépendance DB ni DOM.
//
// Tout le calcul de dates se fait en UTC sur des chaînes 'AAAA-MM-JJ'. Passer
// par des Date locales exposerait aux changements d'heure : le 30 mars, une
// semaine « +7 jours » en heure locale fait 167 h et peut retomber sur le même
// jour. En UTC, un jour fait toujours 24 h.
//
// La semaine commence le LUNDI (convention française), pas le dimanche comme
// le ferait `getDay()` sans correction.

export type ModePeriode = 'jour' | 'semaine' | 'mois'

export interface Bornes {
  /** Premier jour inclus, 'AAAA-MM-JJ'. */
  debut: string
  /** Dernier jour inclus, 'AAAA-MM-JJ'. */
  fin: string
}

const JOUR_MS = 86_400_000

/** 'AAAA-MM-JJ' → Date UTC à minuit. Chaîne invalide → NaN, propagé. */
function versUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

/** Date → 'AAAA-MM-JJ' (composantes UTC). */
function versIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Jour de la semaine, lundi = 0 … dimanche = 6. */
function jourLundiZero(d: Date): number {
  return (d.getUTCDay() + 6) % 7
}

/** Bornes de la période contenant `ancre`. */
export function bornesPeriode(ancre: string, mode: ModePeriode): Bornes {
  const d = versUtc(ancre)
  if (Number.isNaN(d.getTime())) return { debut: ancre, fin: ancre }

  if (mode === 'jour') return { debut: ancre, fin: ancre }

  if (mode === 'semaine') {
    const lundi = new Date(d.getTime() - jourLundiZero(d) * JOUR_MS)
    const dimanche = new Date(lundi.getTime() + 6 * JOUR_MS)
    return { debut: versIso(lundi), fin: versIso(dimanche) }
  }

  // Mois : du 1er au dernier jour. `Date.UTC(a, m + 1, 0)` donne le dernier
  // jour du mois `m` — la bibliothèque gère février et les années bissextiles.
  const a = d.getUTCFullYear()
  const m = d.getUTCMonth()
  return {
    debut: versIso(new Date(Date.UTC(a, m, 1))),
    fin:   versIso(new Date(Date.UTC(a, m + 1, 0))),
  }
}

/**
 * Décale l'ancre d'une période entière (`delta` = -1 précédent, +1 suivant).
 *
 * En mode mois, l'ancre est ramenée au 1er : sans ça, partir du 31 janvier et
 * reculer d'un mois donnerait le 31 février, que JavaScript convertit
 * silencieusement en 2 ou 3 mars.
 */
export function decalerPeriode(ancre: string, mode: ModePeriode, delta: number): string {
  const d = versUtc(ancre)
  if (Number.isNaN(d.getTime())) return ancre

  if (mode === 'jour')    return versIso(new Date(d.getTime() + delta * JOUR_MS))
  if (mode === 'semaine') return versIso(new Date(d.getTime() + delta * 7 * JOUR_MS))

  return versIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1)))
}

/** Libellé lisible de la période, pour l'en-tête de l'écran. */
export function libellePeriode(ancre: string, mode: ModePeriode): string {
  const { debut, fin } = bornesPeriode(ancre, mode)
  const d = versUtc(debut)
  if (Number.isNaN(d.getTime())) return ancre

  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('fr-FR', { ...opts, timeZone: 'UTC' }).format(versUtc(iso))

  if (mode === 'jour') {
    return fmt(debut, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }
  if (mode === 'semaine') {
    const memeMois = debut.slice(0, 7) === fin.slice(0, 7)
    return memeMois
      ? `${fmt(debut, { day: 'numeric' })} – ${fmt(fin, { day: 'numeric', month: 'long', year: 'numeric' })}`
      : `${fmt(debut, { day: 'numeric', month: 'short' })} – ${fmt(fin, { day: 'numeric', month: 'short', year: 'numeric' })}`
  }
  return fmt(debut, { month: 'long', year: 'numeric' })
}

/** Forme minimale d'une course pour le regroupement. */
export interface CoursePourGroupe {
  date: string
}

/**
 * Regroupe les courses par jour, jours triés du plus ancien au plus récent.
 * L'ordre à l'intérieur d'un jour est celui d'entrée : c'est l'appelant qui
 * trie (par heure, par ordre d'arrêt…), pas ce regroupement.
 */
export function grouperParJour<T extends CoursePourGroupe>(courses: T[]): Array<[string, T[]]> {
  const parJour = new Map<string, T[]>()
  for (const c of courses) {
    const liste = parJour.get(c.date)
    if (liste) liste.push(c)
    else parJour.set(c.date, [c])
  }
  return [...parJour.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

/** Statuts qu'un chauffeur peut encore faire avancer depuis son écran. */
const STATUTS_ACTIFS = new Set(['planifiee', 'en_cours'])

/** Une course est « à faire » tant qu'elle n'est ni livrée ni annulée. */
export function estAFaire(statut: string): boolean {
  return STATUTS_ACTIFS.has(statut)
}

/** Compteur « X restantes sur N » affiché en tête de période. */
export function resteAFaire(courses: Array<{ statut: string }>): { reste: number; total: number } {
  return {
    reste: courses.filter(c => estAFaire(c.statut)).length,
    total: courses.length,
  }
}

// ── Revue 01 : prochain arrêt, progression, horaire ─────────────────────────

/** Premier arrêt pas encore fait, dans l'ordre de la route. `null` = journée finie. */
export function prochainArret<T extends { fait: boolean }>(arrets: T[]): T | null {
  return arrets.find(a => !a.fait) ?? null
}

/**
 * « 3 faits sur 12 » : arrêts faits sur le total. Les arrêts d'une course
 * ANNULÉE ne comptent ni d'un côté ni de l'autre : ils ne sont pas « faits »,
 * et il n'y a plus rien à y faire.
 */
export function progression(arrets: Array<{ fait: boolean; annule?: boolean }>): { faits: number; total: number } {
  const comptes = arrets.filter(a => !a.annule)
  return { faits: comptes.filter(a => a.fait).length, total: comptes.length }
}

/** Libellé unique du compteur, partout le même sens : « 3 faits sur 12 ». */
export function libelleProgression(faits: number, total: number): string {
  if (total === 0) return 'aucun arrêt'
  return `${faits} fait${faits > 1 ? 's' : ''} sur ${total}`
}

/**
 * Rang réel d'un arrêt dans la séquence (1 = premier), arrêts annulés exclus.
 * `null` si l'arrêt n'est pas dans la séquence (ou annulé).
 */
export function rangDansSequence(arrets: Array<{ cle: string; annule?: boolean }>, cle: string): number | null {
  const i = arrets.filter(a => !a.annule).findIndex(a => a.cle === cle)
  return i === -1 ? null : i + 1
}

export type EtatHoraire = 'retard' | 'bientot' | 'ok'

/**
 * Où en est-on par rapport à une heure LIMITE (« HH:MM[:SS] ») ?
 *
 * À appeler avec la FIN du créneau promis au client (`creneau_*_fin`), jamais
 * avec `arrival_time` : celle-ci n'est qu'une estimation de la tournée, et
 * afficher « en retard » sur une estimation affole pour rien.
 *
 * `maintenant` est passé en paramètre (heure LOCALE du téléphone, « AAAA-MM-JJ »
 * + minutes depuis minuit) : le module reste pur et testable. Un jour passé
 * est en retard, un jour futur toujours à l'heure. « Bientôt » = dans l'heure.
 */
export function etatHoraire(
  date: string,
  heure: string | null,
  maintenant: { jour: string; minutes: number },
): EtatHoraire | null {
  if (!heure) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(heure)
  if (!m) return null
  if (date < maintenant.jour) return 'retard'
  if (date > maintenant.jour) return 'ok'
  const prevu = Number(m[1]) * 60 + Number(m[2])
  const ecart = prevu - maintenant.minutes
  if (ecart < 0) return 'retard'
  return ecart <= 60 ? 'bientot' : 'ok'
}

/** « 14:30:00 » → « 14 h 30 ». */
export function libelleHeure(heure: string | null): string | null {
  const m = heure ? /^(\d{1,2}):(\d{2})/.exec(heure) : null
  return m ? `${Number(m[1])} h ${m[2]}` : null
}

/**
 * Filtre « mes courses » pour un président / DG qui conduit aussi : la RLS
 * lui rend TOUTES les courses, il ne veut voir que les siennes au volant.
 * `monId` = sa fiche équipe ; sans fiche, rien ne peut être à lui.
 */
export function filtrerMesCourses<T extends { driver_id: string | null }>(
  courses: T[], monId: string | null,
): T[] {
  return monId ? courses.filter(c => c.driver_id === monId) : []
}

/**
 * Créneau d'un arrêt, saisi au bureau : « 9h – 12h », « avant 14h30 »,
 * « à partir de 8h » ; null si aucun.
 */
export function libelleCreneauArret(debut: string | null | undefined, fin: string | null | undefined): string | null {
  const h = (t: string | null | undefined) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '')
    return m ? `${Number(m[1])}h${m[2] === '00' ? '' : m[2]}` : null
  }
  const d = h(debut), f = h(fin)
  if (d && f) return `${d} – ${f}`
  if (f) return `avant ${f}`
  if (d) return `à partir de ${d}`
  return null
}

/** « 14:30:00 » → « ~14:30 » : heure de passage ESTIMÉE (tournée), pas un engagement. */
export function libelleHeureEstimee(heure: string | null): string | null {
  const m = heure ? /^(\d{1,2}):(\d{2})/.exec(heure) : null
  return m ? `~${m[1].padStart(2, '0')}:${m[2]}` : null
}

// ── Dates du jour, confirmations ────────────────────────────────────────────

/** « 2026-10-12 » → « lun. 12 oct. » : tient dans l'en-tête à 390 px. */
export function libelleDateCourte(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)
}

/**
 * Faut-il confirmer un geste (Démarrer / Charger / Livrer) ? Oui quand la course
 * n'est pas d'aujourd'hui : un doigt qui glisse sur la semaine ne doit pas
 * démarrer la course de jeudi. Renvoie la question, ou `null` si rien à demander.
 */
export function confirmationAutreJour(dateCourse: string, aujourdhui: string): string | null {
  if (dateCourse === aujourdhui) return null
  const quand = dateCourse < aujourdhui ? 'prévue un jour passé' : 'prévue plus tard'
  return `Cette course est ${quand} (${libelleDateCourte(dateCourse)}), pas aujourd'hui. Continuer quand même ?`
}

// ── Messages ────────────────────────────────────────────────────────────────

/**
 * Libellés lisibles des statuts de course. Mêmes mots que l'écran Livraisons
 * (`livraisons.logic#STATUS_LABELS`), en minuscule pour une phrase ;
 * `shared/lib/livraisonStatuts` ne porte pas (encore) de libellés.
 */
const LIBELLE_STATUT: Record<string, string> = {
  planifiee: 'planifiée', en_cours: 'en cours', livree: 'livrée',
  facturee: 'facturée', payee: 'payée', annulee: 'annulée',
}

/** « Cette course est livrée : impossible de la démarrer. » — sans code brut. */
export function messageTransitionImpossible(statut: string, cible: 'en_cours' | 'livree'): string {
  const etat = LIBELLE_STATUT[statut] ?? 'dans un état inattendu'
  const geste = cible === 'en_cours' ? 'la démarrer' : 'la livrer'
  return `Cette course est ${etat} : impossible de ${geste}. Recharge la page ou préviens le bureau.`
}

export const MESSAGE_DROIT_MANQUANT =
  "Enregistrement refusé : ton compte n'a pas encore ce droit, préviens le bureau."

/**
 * Traduit une erreur d'écriture en phrase pour le chauffeur.
 *
 * - 0 ligne modifiée (RLS silencieuse, code `0_LIGNE`, ou `.single()` qui
 *   répond « JSON object requested, multiple (or no) rows returned » / PGRST116),
 * - refus explicite (row-level security, permission denied, 42501)
 * → « Enregistrement refusé : ton compte n'a pas encore ce droit… ».
 * Le reste passe tel quel (à défaut d'un message vide).
 */
export function traduireErreurEcriture(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return ''
  const msg = error.message ?? ''
  if (error.code === '0_LIGNE' || error.code === 'PGRST116' || error.code === '42501') return MESSAGE_DROIT_MANQUANT
  if (/JSON object requested|row-level security|permission denied|violates.*policy/i.test(msg)) return MESSAGE_DROIT_MANQUANT
  if (/failed to fetch|network/i.test(msg)) return "Pas de réseau : rien n'a été enregistré, réessaie dans un instant."
  return msg || 'Enregistrement impossible, réessaie ou préviens le bureau.'
}

/** Envoi de photo refusé : même phrase partout (preuve, problème). */
export function messageEnvoiPhoto(message: string | undefined): string {
  const m = message ?? 'Envoi impossible'
  return /row-level security|permission|policy/i.test(m)
    ? "Ton compte n'a pas le droit d'ajouter des photos. Préviens le bureau — tu peux valider sans."
    : m
}

// ── Pièces jointes, véhicule ────────────────────────────────────────────────

const LIBELLE_CATEGORIE: Record<string, string> = {
  POD: 'Preuve de livraison',
  Chargement: 'Photo au chargement',
  LV: 'Lettre de voiture',
  Client: 'Document client',
  Administratif: 'Document administratif',
  Comptable: 'Document comptable',
  RH: 'Document RH',
  'Véhicule': 'Document véhicule',
  Autre: 'Document',
}

export function libelleCategorieDocument(categorie: string | null | undefined): string {
  return (categorie && LIBELLE_CATEGORIE[categorie]) || 'Document'
}

/**
 * Pièces à montrer au chauffeur : celles du BUREAU (bon de commande, étiquette,
 * consignes…). Ses propres photos, il vient de les prendre — les relister
 * noie le document utile au milieu de ses clichés.
 */
export function documentsPourChauffeur<T extends { uploaded_by: string | null }>(docs: T[], monCompte: string | null): T[] {
  return monCompte ? docs.filter(d => d.uploaded_by !== monCompte) : docs
}

/** Véhicule(s) du jour, sans doublon : « Movano · AB-123-CD ». Annulées exclues. */
export function vehiculesDuJour(courses: Array<{ statut: string; vehicles: { label: string; plate: string } | null }>): string[] {
  const vus = new Set<string>()
  for (const c of courses) {
    if (c.statut === 'annulee' || !c.vehicles) continue
    const l = [c.vehicles.label, c.vehicles.plate].filter(Boolean).join(' · ')
    if (l) vus.add(l)
  }
  return [...vus]
}
