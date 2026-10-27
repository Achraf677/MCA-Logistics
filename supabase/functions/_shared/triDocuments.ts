// Tri des documents par l'IA (onglet Documents) — règles PURES (aucun Deno.*, aucun fetch), testées par vitest.
// Miroir côté site : `src/shared/lib/documentsTri.ts` (même liste de types, même fabrique de nom) — un test compare les deux.
// L'IA PROPOSE (type, date, tiers, montant, référence, résumé) ; le nom proposé est fabriqué ici, jamais par l'IA ; l'utilisateur confirme.

import { CLES_TYPE, SANS_DATE, cleePlaque, nomPropose } from './conventionDocuments.ts'

export {
  TYPES_DOCUMENT, CLES_TYPE, bloc, cheminConvention, cheminDefaut, cheminHabituel, choisirChemin, cleePlaque, completerDepuisOrigine, DOSSIER_TRANSIT, dossierVehicule, exemplesRangement,
  extensionDe, libelleType, nomPropose, origineDuDocument, partieDuTexte, SANS_DATE, salarieDuNom, typeDe, typeHabituel, typeSensibleDuNom,
} from './conventionDocuments.ts'
export type { Annuaire, ClasseHistorique, ElementsChemin, ElementsNom, Origine, TypeDocument } from './conventionDocuments.ts'

/** En dessous, la valeur lue est écartée (champ vide à remplir à la main). */
export const SEUIL_PROPOSITION = 0.4

export interface PropositionBrute {
  type?: unknown; type_confiance?: unknown
  date?: unknown; date_confiance?: unknown
  tiers?: unknown; tiers_confiance?: unknown
  montant_ttc?: unknown; montant_confiance?: unknown
  reference?: unknown; resume?: unknown
}

export interface Proposition {
  type: string | null
  date: string | null
  tiers: string | null
  montant_ttc_cts: number | null
  reference: string | null
  resume: string | null
  /** Confiance de chaque champ (0 à 1) : l'écran surligne ce qui est douteux. */
  confiance: { type: number; date: number; tiers: number; montant: number }
}

const conf = (c: unknown): number => {
  const n = Number(c)
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0
}

/** Borne et filtre la réponse brute de l'IA : un champ douteux ou invraisemblable revient `null`. */
export function normaliserProposition(brut: PropositionBrute | null | undefined, aujourdhui: string): Proposition {
  const b = brut ?? {}
  const cType = conf(b.type_confiance), cDate = conf(b.date_confiance), cTiers = conf(b.tiers_confiance), cMontant = conf(b.montant_confiance)
  const type = typeof b.type === 'string' && CLES_TYPE.includes(b.type) ? b.type : null
  const date = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && b.date <= aujourdhui && b.date >= '2000-01-01' ? b.date : null
  const tiers = typeof b.tiers === 'string' && b.tiers.trim() ? b.tiers.trim().slice(0, 80) : null
  const m = Number(b.montant_ttc)
  const montant = Number.isFinite(m) && m > 0 && m < 10_000_000 ? Math.round(m * 100) : null
  const reference = typeof b.reference === 'string' && b.reference.trim() ? b.reference.trim().slice(0, 40) : null
  const resume = typeof b.resume === 'string' && b.resume.trim() ? b.resume.trim().slice(0, 200) : null
  return {
    type: type && cType >= SEUIL_PROPOSITION ? type : null,
    date: date && cDate >= SEUIL_PROPOSITION ? date : null,
    tiers: tiers && cTiers >= SEUIL_PROPOSITION ? tiers : null,
    montant_ttc_cts: montant != null && cMontant >= SEUIL_PROPOSITION ? montant : null,
    reference,
    resume,
    confiance: { type: cType, date: cDate, tiers: cTiers, montant: cMontant },
  }
}

const sansAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/** Nettoie un nom de dossier Drive : pas de caractères interdits, 60 caractères au plus. */
export function segmentPropre(s: unknown): string {
  return typeof s === 'string' ? s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60) : ''
}

// ── Aide à la décision de l'IA : arborescence du Drive, tiers et véhicules connus ──────────────────────────

const normal = (s: string) => sansAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Un dossier Drive tel que le renvoie l'API (`parents` : au plus un parent pour un dossier ordinaire). */
export interface DossierDrive { id: string; name: string; parents?: string[] }

/**
 * Tous les chemins existants sous `racineId`, relatifs à la racine (au plus `profondeur` niveaux, `max` chemins) :
 * c'est ce que l'IA reçoit pour choisir un dossier qui existe déjà plutôt que d'en inventer un.
 */
export function cheminsExistants(dossiers: readonly DossierDrive[], racineId: string, profondeur = 4, max = 250): string[][] {
  const enfants = new Map<string, DossierDrive[]>()
  for (const d of dossiers) for (const p of d.parents ?? []) enfants.set(p, [...(enfants.get(p) ?? []), d])
  const sortie: string[][] = []
  const descendre = (id: string, chemin: string[]) => {
    if (chemin.length >= profondeur) return
    for (const e of [...(enfants.get(id) ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr'))) {
      if (sortie.length >= max) return
      const c = [...chemin, e.name]
      sortie.push(c)
      descendre(e.id, c)
    }
  }
  descendre(racineId, [])
  return sortie
}

export interface CheminPropose { chemin: string[]; /** Pour chaque niveau : le dossier n'existe pas encore (il sera créé). */ nouveaux: boolean[] }

/**
 * Chemin proposé par l'IA, nettoyé : 4 niveaux au plus, noms identiques à ceux déjà dans le Drive (casse / accents près),
 * chaque niveau marqué « existe » ou « nouveau ». Réponse vide ou absurde → chemin par défaut.
 */
export function normaliserChemin(brut: unknown, existants: readonly string[][], defaut: readonly string[]): CheminPropose {
  const lu = (Array.isArray(brut) ? brut : typeof brut === 'string' ? brut.split(/\s*[/>]\s*/) : [])
    .map(segmentPropre).filter(Boolean).slice(0, 4)
  const segments = lu.length > 0 ? lu : [...defaut]
  const chemin: string[] = []
  const nouveaux: boolean[] = []
  let connu = true
  for (const seg of segments) {
    const trouve = connu
      ? existants.find(e => e.length === chemin.length + 1 && e.slice(0, chemin.length).every((x, i) => x === chemin[i]) && normal(e[chemin.length]) === normal(seg))
      : undefined
    if (trouve) { chemin.push(trouve[chemin.length]); nouveaux.push(false) } else { connu = false; chemin.push(seg); nouveaux.push(true) }
  }
  return { chemin, nouveaux }
}

const MOTS_SOCIETE = new Set(['sarl', 'sas', 'sasu', 'eurl', 'sa', 'ets', 'ste', 'societe', 'groupe', 'et', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd'])
const cleTiers = (s: string) => normal(s).split(' ').filter(m => m && !MOTS_SOCIETE.has(m)).join(' ')

/**
 * Rattache le tiers lu sur le document à une fiche connue (client / fournisseur) : même nom, ou l'un contient l'autre
 * (5 lettres au moins). Le nom de la fiche l'emporte, pour que « ASDIA SAS » et « Asdia » donnent le même dossier.
 */
export function rapprocherTiers(lu: string | null | undefined, connus: readonly string[]): { nom: string | null; connu: boolean } {
  const cle = lu ? cleTiers(lu).replace(/ /g, '') : ''
  if (!cle) return { nom: lu?.trim() || null, connu: false }
  let meilleur: string | null = null
  let score = 0
  for (const c of connus) {
    const k = cleTiers(c).replace(/ /g, '')
    if (!k) continue
    if (k === cle) return { nom: c, connu: true }
    if (Math.min(k.length, cle.length) >= 5 && (k.includes(cle) || cle.includes(k)) && k.length > score) { meilleur = c; score = k.length }
  }
  return meilleur ? { nom: meilleur, connu: true } : { nom: lu!.trim(), connu: false }
}

/** Plaque lue → plaque de la flotte (même plaque une fois normalisée), sinon null. */
export function rapprocherVehicule(lu: string | null | undefined, plaques: readonly string[]): string | null {
  const k = cleePlaque(lu)
  return k.length >= 5 ? plaques.find(p => cleePlaque(p) === k) ?? null : null
}

// ── Documents d'une tournée de colis : rangés d'après les DONNÉES de la tournée, sans lecture par l'IA ──────────

export interface ContexteTournee {
  nature: 'feuille' | 'synthese' | 'arret'
  /** Date de la tournée (AAAA-MM-JJ) ; à défaut celle du dépôt du fichier. */
  date: string | null
  client: string | null
  salarie: string | null
  /** Feuille : numéro de page (feuille-de-route-page-2.jpg → 2). Synthèse : rang de la photo dans la tournée. */
  numero: number | null
  /** Arrêt : adresse (« 12 rue des Lilas, Brumath »). */
  adresse?: string | null
}

export const DOSSIER_TOURNEES = 'Tournées de colis'
const SOUS_DOSSIER: Record<ContexteTournee['nature'], string> = { feuille: 'Feuilles de route', synthese: 'Synthèses de tournée', arret: 'Preuves de livraison' }
const TYPE_TOURNEE: Record<ContexteTournee['nature'], string> = { feuille: 'feuille_de_route', synthese: 'synthese_tournee', arret: 'preuve_livraison' }

/** Numéro de page lu dans le nom d'un scan (« feuille-de-route-page-3.jpg » → 3), sinon null. */
export const pageDuNom = (nom: string): number | null => {
  const m = /page[-_ ]?(\d{1,2})/i.exec(nom)
  return m ? Number(m[1]) : null
}

/**
 * Proposition complète pour un document de tournée : type, date, tiers (le salarié de la tournée, à défaut le client), référence,
 * nom rangé et dossier `Transport / Tournées de colis / <nature> / AAAA-MM`. Rien n'est deviné : tout vient de la tournée.
 */
export function propositionTournee(c: ContexteTournee, nomActuel: string, pris: ReadonlySet<string> = new Set()) {
  const date = c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date : null
  // Le document est celui du salarié qui a fait la tournée (nom de la convention : « …_FEUILLE-DE-ROUTE_<SALARIÉ>_P1 ») ; à défaut, le client.
  const tiers = c.salarie || c.client || null
  const reference = c.nature === 'arret' ? (c.adresse ?? null) : c.numero != null ? (c.nature === 'feuille' ? `p${c.numero}` : String(c.numero)) : null
  const type = TYPE_TOURNEE[c.nature]
  const chemin = ['Transport', DOSSIER_TOURNEES, SOUS_DOSSIER[c.nature], date ? date.slice(0, 7) : SANS_DATE]
  const resume = c.nature === 'feuille' ? `Feuille de route de la tournée du ${date ?? 'jour inconnu'}${c.numero != null ? `, page ${c.numero}` : ''}.`
    : c.nature === 'synthese' ? `Photo de synthèse de fin de tournée du ${date ?? 'jour inconnu'}${c.salarie ? `, ${c.salarie}` : ''}.`
      : `Preuve de livraison de la tournée du ${date ?? 'jour inconnu'}${c.adresse ? `, ${c.adresse}` : ''}.`
  return { type, date, tiers, reference, resume, chemin, nom: nomPropose({ date, type, tiers, reference }, nomActuel, pris) }
}
