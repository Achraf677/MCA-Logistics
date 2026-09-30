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

/** « 3 / 12 » : arrêts faits sur le total. */
export function progression(arrets: Array<{ fait: boolean }>): { faits: number; total: number } {
  return { faits: arrets.filter(a => a.fait).length, total: arrets.length }
}

export type EtatHoraire = 'retard' | 'bientot' | 'ok'

/**
 * Où en est-on par rapport à l'heure prévue (`arrival_time`, « HH:MM[:SS] ») ?
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
