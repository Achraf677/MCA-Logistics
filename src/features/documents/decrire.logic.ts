// « Dis-moi ce que c'est » : l'utilisateur décrit un document en une phrase (« permis de conduire Jean Dupont »,
// « facture Leclerc 12345 du 5 octobre »), on en tire type, tiers, date, référence, véhicule. PUR : aucune IA, aucun appel réseau.
import { cheminConvention, cleePlaque, nomPropose, typeDe } from '../../shared/lib/conventionDocuments'
import type { PropositionDocument } from '../../shared/lib/documents.types'
import { aligner } from './documents.logic'

export interface Referents { clients: string[]; fournisseurs: string[]; salaries: string[]; plaques: string[] }

export interface Description {
  type: string
  tiers: string | null
  date: string | null
  reference: string | null
  vehicule: string | null
}

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Mots-clés → type (le premier qui correspond gagne : du plus précis au plus général). « facture » est tranchée par le tiers. */
const MOTS_TYPE: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bavis (de )?paiement\b/, 'avis_paiement'],
  [/\bcontestation\b/, 'contestation'],
  [/\b(amende|contravention|fps)\b|\bpv (de )?stationnement\b/, 'amende'],
  [/\bpermis( (de )?conduire)?\b/, 'permis'],
  [/\b(carte (d )?identite|cni|passeport|piece (d )?identite)\b/, 'identite'],
  [/\b(casier( judiciaire)?|non condamnation)\b/, 'casier'],
  [/\b(carte )?vitale\b/, 'carte_vitale'],
  [/\b(codes? (d )?acces|2fa|mots? de passe)\b/, 'codes_acces'],
  [/\b(carte grise|certificat (d )?immatriculation)\b/, 'carte_grise'],
  [/\b(certificat (de )?cession|cession)\b/, 'certificat_cession'],
  [/\bcontrole technique\b/, 'controle_technique'],
  [/\b((bulletin|fiche) (de )?paie|bulletin|paie)\b/, 'paie'],
  [/\b(dpae|contrat (de )?travail)\b/, 'dpae'],
  [/\bcapacite( (de )?transport)?\b/, 'capacite_transport'],
  [/\blicence( (de )?transport)?\b/, 'licence'],
  [/\bavoir\b/, 'avoir'],
  [/\bacompte\b/, 'acompte'],
  [/\bdevis\b/, 'devis'],
  [/\bbon (de )?commande\b/, 'bon_commande'],
  [/\bbon (de )?livraison\b/, 'bon_livraison'],
  [/\b(lettre (de )?voiture|cmr)\b/, 'lettre_de_voiture'],
  [/\bordre (de )?transport\b/, 'ordre_transport'],
  [/\bfactures?\b/, 'facture'],
  [/\b(assurance|cotisation|dispositions particulieres)\b/, 'assurance'],
  [/\b(kbis|rbe)\b/, 'kbis'],
  [/\bstatuts?\b/, 'statuts'],
  [/\b(rib|iban)\b/, 'rib'],
  [/\breleve( bancaire)?\b/, 'releve_bancaire'],
  [/\b(tva|impots?|urssaf|cfe|liasse|declaration)\b/, 'fiscal_social'],
  [/\b(pv|proces verbal|assemblee|decision)\b/, 'pv'],
  [/\bavenant\b/, 'avenant'],
  [/\bcharte\b/, 'charte'],
  [/\bcontrat\b/, 'contrat'],
  [/\battestation\b/, 'attestation'],
  [/\b(ticket|recu|note de frais)\b/, 'ticket'],
  [/\b(modele|formulaire)\b/, 'modele'],
  [/\b(courrier|lettre)\b/, 'courrier_administratif'],
  [/\bphoto\b/, 'photo'],
]

const TYPES_SALARIE = new Set(['permis', 'identite', 'casier', 'carte_vitale', 'paie', 'dpae', 'document_salarie'])
const TYPES_CLIENT = new Set(['facture_client', 'avoir', 'acompte', 'devis', 'bon_commande', 'bon_livraison', 'lettre_de_voiture', 'ordre_transport', 'charte', 'contrat'])
const TYPES_FOURNISSEUR = new Set(['facture_fournisseur', 'ticket'])

const MOTS_VIDES = new Set(['de', 'du', 'des', 'le', 'la', 'les', 'l', 'd', 'un', 'une', 'pour', 'a', 'au', 'aux', 'et', 'en', 'sur', 'mon', 'ma', 'mes', 'ce', 'cet', 'cette', 'est', 'c', 'chez', 'ref', 'reference', 'numero', 'num', 'no', 'n', 'date'])

const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre']

const deux = (n: number) => String(n).padStart(2, '0')
const jourValide = (a: number, m: number, j: number) => m >= 1 && m <= 12 && j >= 1 && j <= new Date(a, m, 0).getDate()

/** Cherche une date dans le texte (déjà sans accent ni majuscule) ; renvoie la date ISO et le texte sans elle. */
function extraireDate(t: string, aujourdhui: string): { date: string | null; reste: string } {
  const [aa, am, aj] = aujourdhui.split('-').map(Number)
  const complete = (annee: number | null, m: number, j: number): string | null => {
    let a = annee ?? aa
    if (annee == null && (m > am || (m === am && j > aj))) a -= 1 // « 5 décembre » en octobre : l'an dernier
    return jourValide(a, m, j) ? `${a}-${deux(m)}-${deux(j)}` : null
  }
  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(t)
  if (m) { const d = jourValide(+m[1], +m[2], +m[3]) ? `${m[1]}-${deux(+m[2])}-${deux(+m[3])}` : null; if (d) return { date: d, reste: t.replace(m[0], ' ') } }
  m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/.exec(t)
  if (m) {
    const annee = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    const d = jourValide(annee, +m[2], +m[1]) ? `${annee}-${deux(+m[2])}-${deux(+m[1])}` : null
    if (d) return { date: d, reste: t.replace(m[0], ' ') }
  }
  m = new RegExp(`\\b(1er|\\d{1,2})\\s+(${MOIS.join('|')})(?:\\s+(\\d{4}))?\\b`).exec(t)
  if (m) {
    const d = complete(m[3] ? +m[3] : null, MOIS.indexOf(m[2]) + 1, m[1] === '1er' ? 1 : +m[1])
    if (d) return { date: d, reste: t.replace(m[0], ' ') }
  }
  m = new RegExp(`\\b(${MOIS.join('|')})\\s+(\\d{4})\\b`).exec(t)
  if (m) return { date: `${m[2]}-${deux(MOIS.indexOf(m[1]) + 1)}-01`, reste: t.replace(m[0], ' ') }
  m = /\baujourd\s?hui\b/.exec(t)
  if (m) return { date: aujourdhui, reste: t.replace(m[0], ' ') }
  return { date: null, reste: t }
}

const estPlaque = (tok: string) => /^[a-z]{2}-?\d{3}-?[a-z]{2}$/.test(tok)
const formaterPlaque = (tok: string) => { const k = cleePlaque(tok); return `${k.slice(0, 2)}-${k.slice(2, 5)}-${k.slice(5)}` }

/** Nom connu dont les mots sont tous dans le texte (« lucas bacher » ↔ « Bacher Lucas ») ; à défaut, le seul nom dont un mot (4 lettres) y figure. */
function trouverConnu(mots: readonly string[], noms: readonly string[]): { nom: string; utilises: string[] } | null {
  const lie = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)))
  let meilleur: { nom: string; score: number; utilises: string[] } | null = null
  for (const nom of noms) {
    const motsNom = normal(nom).split(' ').filter(w => w.length >= 3)
    if (motsNom.length === 0) continue
    const utilises = motsNom.map(w => mots.find(t => lie(t, w)))
    if (utilises.some(u => !u)) continue
    const score = motsNom.reduce((s, w) => s + w.length, 0)
    if (!meilleur || score > meilleur.score) meilleur = { nom, score, utilises: utilises as string[] }
  }
  if (meilleur) return { nom: meilleur.nom, utilises: meilleur.utilises }
  const uniques = noms.filter(nom => normal(nom).split(' ').some(w => w.length >= 4 && mots.some(t => lie(t, w))))
  if (uniques.length === 1) {
    const w = normal(uniques[0]).split(' ').find(x => x.length >= 4 && mots.some(t => lie(t, x)))!
    return { nom: uniques[0], utilises: [mots.find(t => lie(t, w))!] }
  }
  return null
}

/**
 * Comprend une phrase décrivant un document. `null` = type introuvable (rien à appliquer).
 * Tiers : fiche connue (client, fournisseur ou salarié selon le type), sinon le texte restant en MAJUSCULES.
 */
export function analyserDescription(texte: string, ref: Referents, aujourdhui: string): Description | null {
  let t = texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/n\s*°\s*/g, ' ').replace(/[,;]/g, ' ')
  const brut = normal(texte)
  let cle: string | null = null
  let motType = ''
  for (const [re, c] of MOTS_TYPE) { const m = re.exec(brut); if (m) { cle = c; motType = m[0]; break } }
  if (!cle) return null

  const { date, reste } = extraireDate(t, aujourdhui)
  t = reste

  // Référence (numéro isolé) et plaque : repérées sur les mots bruts (le tiret des numéros compte).
  let reference: string | null = null
  let vehicule: string | null = null
  const restants: string[] = []
  for (const tok of t.split(/\s+/).filter(Boolean)) {
    const plaque = ref.plaques.find(p => cleePlaque(p) === cleePlaque(tok))
    if (!vehicule && (plaque || estPlaque(tok))) { vehicule = plaque ?? formaterPlaque(tok); continue }
    if (!reference && /\d/.test(tok) && tok.length >= 3 && /^[a-z]{0,6}[-/_.]?\d[a-z0-9./_-]*$/.test(tok)) { reference = tok.toUpperCase(); continue }
    restants.push(tok)
  }
  const motsTexte = normal(restants.join(' ')).split(' ').filter(Boolean)
  const motsType = new Set(normal(motType).split(' '))
  const candidats = motsTexte.filter(w => !motsType.has(w) && !MOTS_VIDES.has(w))

  // Tiers connu : les fiches qui correspondent au type, puis toutes les autres.
  const listes: string[][] = TYPES_SALARIE.has(cle) ? [ref.salaries, ref.clients, ref.fournisseurs]
    : cle === 'facture' ? [ref.clients, ref.fournisseurs, ref.salaries]
      : TYPES_CLIENT.has(cle) ? [ref.clients, ref.fournisseurs, ref.salaries]
        : TYPES_FOURNISSEUR.has(cle) ? [ref.fournisseurs, ref.clients, ref.salaries] : [ref.clients, ref.fournisseurs, ref.salaries]
  let tiers: string | null = null
  let origine = -1
  for (let i = 0; i < listes.length && tiers == null; i++) {
    const r = trouverConnu(candidats, listes[i])
    if (r) { tiers = r.nom; origine = i }
  }
  if (tiers == null) {
    const nom = candidats.join(' ').trim()
    tiers = nom ? nom.toUpperCase() : null
  }

  let type = cle
  if (cle === 'facture') type = origine === 0 && listes[0] === ref.clients ? 'facture_client' : 'facture_fournisseur'
  return { type, tiers, date, reference, vehicule }
}

/** Dernier niveau déjà dans le Drive ? Par niveau : le dossier n'existe pas encore. */
function niveauxNouveaux(chemin: readonly string[], existants: ReadonlyArray<readonly string[]>): boolean[] {
  return chemin.map((_, i) => !existants.some(e => e.length === i + 1 && chemin.slice(0, i + 1).every((x, k) => x === e[k])))
}

/**
 * Proposition complète d'un document d'après la description de l'utilisateur (sans IA) : nom de la convention + dossier de la convention.
 * Sert aux documents de l'Inbox que l'IA n'a pas su lire.
 */
export function propositionDepuisDescription(
  d: Description, doc: { file_name: string; created_at: string }, existants: ReadonlyArray<readonly string[]>, pris: ReadonlySet<string> = new Set(),
): PropositionDocument {
  const dateDepot = doc.created_at.slice(0, 10)
  const regle = cheminConvention({ type: d.type, date: d.date ?? (typeDe(d.type)?.intemporel ? null : dateDepot), tiers: d.tiers, vehicule: d.vehicule }, existants)
  const chemin = aligner(regle ?? ['A traiter'], existants)
  return {
    type: d.type, date: d.date, tiers: d.tiers, tiers_connu: true, montant_ttc_cts: null, reference: d.reference, resume: null,
    confiance: { type: 1, date: 1, tiers: 1, montant: 1 },
    nom: nomPropose({ date: d.date, dateDepot, type: d.type, tiers: d.tiers, reference: d.reference }, doc.file_name, pris),
    vehicule: d.vehicule, chemin, chemin_nouveaux: niveauxNouveaux(chemin, existants), chemin_confiance: 1, alternatives: [],
    lu_via: 'saisie', propose_le: new Date().toISOString(),
  }
}

/** Date du jour en local (AAAA-MM-JJ), jamais `toISOString` (la veille avant 2 h). */
export function aujourdhuiLocal(d = new Date()): string {
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
}
