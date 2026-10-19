// Points La Poste (relais poste commerçants, agences postales, bureaux) de la zone de livraison :
// horaires du jour lus par l'Edge `horaires-relais-poste` (open data La Poste). Les relais « Pickup »
// ne sont PAS dans cette base : aucun horaire pour eux (on n'affiche rien).

/** Minuscules, sans accents ni ponctuation : « Rue du Général de Gaulle » = « rue du general de gaulle ». */
function cleTexte(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export interface SitePoste { id: string; libelle: string; commune: string; rue: string; numero: string }

/** Identifiants La Poste (data.laposte.fr, jeu « Liste des bureaux de poste… »), vérifiés le 19/10/2026. */
export const SITES_POSTE: readonly SitePoste[] = [
  { id: '12532A', libelle: 'Relais poste Geudertheim', commune: 'geudertheim', rue: 'rue du general de gaulle', numero: '52' },
  { id: '12585A', libelle: 'Relais poste Mommenheim', commune: 'mommenheim', rue: 'route de brumath', numero: '37' },
  { id: '12692A', libelle: 'Agence postale Wingersheim', commune: 'wingersheim', rue: 'rue de la 1ere armee', numero: '1' },
  { id: '12494A', libelle: 'Bureau de poste Brumath', commune: 'brumath', rue: 'place victor fischer', numero: '4' },
]

export const IDS_POSTE: string[] = SITES_POSTE.map(s => s.id)

/** Le site La Poste correspondant à l'adresse d'un arrêt (commune + rue + numéro), sinon null. */
export function sitePosteDeLArret(a: { commune: string | null; rue: string | null; numero: string | null }): SitePoste | null {
  const commune = cleTexte(a.commune ?? '')
  const rue = cleTexte(a.rue ?? '')
  const numero = (a.numero ?? '').trim().toLowerCase()
  if (!commune || !rue || !numero) return null
  return SITES_POSTE.find(s => commune.startsWith(s.commune) && rue === s.rue && numero === s.numero) ?? null
}

export interface HorairesJour { plages: string[]; ferme: boolean }

export type EtatRelais =
  | { etat: 'ouvert'; texte: string }
  | { etat: 'ferme'; texte: string }
  | { etat: 'ferme_aujourdhui'; texte: string }

const minutes = (hhmm: string): number => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
const joli = (hhmm: string): string => { const [h, m] = hhmm.split(':'); return `${Number(h)} h${m === '00' ? '' : ` ${m}`}` }

/** « 6 h 30-12 h · 15 h-18 h 45 ». */
export function libellePlages(plages: string[]): string {
  return plages.map(p => p.split('-').map(joli).join('-')).join(' · ')
}

/** Ouvert maintenant ? Sinon, jusqu'à quand c'est fermé. `maintenant` = minutes depuis minuit (heure de Paris). */
export function etatRelais(h: HorairesJour, maintenant: number): EtatRelais {
  if (h.ferme || !h.plages.length) return { etat: 'ferme_aujourdhui', texte: 'Fermé aujourd’hui' }
  const plages = h.plages.map(p => { const [a, b] = p.split('-'); return { a: minutes(a), b: minutes(b), fin: b } })
  const courante = plages.find(p => maintenant >= p.a && maintenant < p.b)
  if (courante) return { etat: 'ouvert', texte: `Ouvert jusqu’à ${joli(courante.fin)}` }
  const prochaine = plages.find(p => p.a > maintenant)
  if (prochaine) return { etat: 'ferme', texte: `Fermé · ouvre à ${joli(h.plages[plages.indexOf(prochaine)].split('-')[0])}` }
  return { etat: 'ferme', texte: 'Fermé pour aujourd’hui' }
}

/** Minutes depuis minuit à Paris. */
export function minutesParis(d = new Date()): number {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d)
  return Number(p.find(x => x.type === 'hour')?.value ?? 0) * 60 + Number(p.find(x => x.type === 'minute')?.value ?? 0)
}

/** Jour à Paris au format AAAA-MM-JJ. */
export function jourParis(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d)
}
