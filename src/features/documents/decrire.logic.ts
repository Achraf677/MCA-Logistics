// « Dis-moi ce que c'est » : l'utilisateur décrit un document en une phrase (« permis de conduire Jean Dupont », « le verso du permis de Marie »,
// « facture Leclerc 12345 du 5 octobre »), on en tire type, tiers, date, référence, véhicule, partie. PUR : aucune IA, aucun appel réseau.
// Souple : ordre libre, fautes de frappe (1 lettre), abréviations (CT, CG, FDR, BL…), prénom seul s'il est unique, plusieurs dates, montant ignoré.
// Autodidacte : l'origine du document (fiche d'où il vient) et l'historique des documents rangés complètent ce que la phrase ne dit pas.
import {
  SANS_ORIGINE, TYPES_CLIENT, TYPES_DOCUMENT, TYPES_SALARIE, choisirChemin, cleePlaque, completerDepuisOrigine, nomPropose, partieDuTexte, typeDe, typeHabituel,
  type ClasseHistorique, type Origine,
} from '../../shared/lib/conventionDocuments'
import type { PropositionDocument } from '../../shared/lib/documents.types'
import { aligner } from './documents.logic'

export interface Referents { clients: string[]; fournisseurs: string[]; salaries: string[]; plaques: string[] }

export interface Description {
  type: string
  tiers: string | null
  /** Le tiers vient d'une fiche connue (client, fournisseur, salarié) ou de l'origine du document. */
  tiersConnu: boolean
  date: string | null
  reference: string | null
  vehicule: string | null
  /** VERSO, RECTO, P2, SUITE, ANNEXE… */
  partie: string | null
  /** Montant écrit dans la phrase (« 12,50 € ») : va dans la fiche, jamais dans le nom. */
  montant_ttc_cts: number | null
  /** Le tiers ou le véhicule a été complété par l'origine du document. */
  parOrigine: boolean
  /** Le type n'était pas dans la phrase : repris de l'habitude du tiers. */
  typeParHabitude: boolean
}

export interface OptionsDescription {
  /** D'où vient le document (fiche salarié, véhicule, client, déposé par). */
  origine?: Origine
  /** Documents déjà rangés : type habituel d'un tiers. */
  classes?: readonly ClasseHistorique[]
  /** Type imposé (bouton de suggestion) : la phrase n'a plus à le dire. */
  type?: string
}

const normal = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Distance d'édition bornée (renvoie max + 1 dès qu'elle dépasse). */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prec = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let mini = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prec[j] + 1, cur[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (cur[j] < mini) mini = cur[j]
    }
    if (mini > max) return max + 1
    prec = cur
  }
  return prec[b.length]
}

/** Abréviations courantes → mots entiers (mot isolé seulement). */
const ABREVIATIONS: Record<string, string> = {
  ct: 'controle technique', cg: 'carte grise', fdr: 'feuille de route', bl: 'bon livraison', lv: 'lettre voiture', bc: 'bon commande', fa: 'facture', fact: 'facture',
  att: 'attestation', ass: 'assurance', bdp: 'bulletin paie', dec: 'declaration',
}

/** Mots-clés des types (pour rattraper une faute de frappe sur un mot de 5 lettres ou plus). */
const VOCABULAIRE = [
  'permis', 'conduire', 'identite', 'passeport', 'casier', 'judiciaire', 'vitale', 'facture', 'factures', 'avoir', 'acompte', 'amende', 'contravention', 'assurance', 'cotisation',
  'bulletin', 'attestation', 'courrier', 'ticket', 'statuts', 'statut', 'contrat', 'avenant', 'charte', 'licence', 'capacite', 'cession', 'grise', 'controle', 'technique', 'commande',
  'livraison', 'releve', 'bancaire', 'declaration', 'impots', 'urssaf', 'proces', 'verbal', 'assemblee', 'decision', 'formulaire', 'modele', 'condamnation', 'immatriculation',
  'certificat', 'transport', 'voiture', 'feuille', 'synthese', 'tournee', 'paiement', 'devis', 'recto', 'verso', 'annexe', 'cmr',
  // Mots des expressions (« carte grise », « feuille de route »…) : jamais corrigés en un autre mot-clé.
  'carte', 'route', 'frais', 'notes', 'dispositions', 'particulieres', 'stationnement',
]

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
  [/\b(feuille (de )?route|tournee)\b/, 'feuille_de_route'],
  [/\bsynthese\b/, 'synthese_tournee'],
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

const MOTS_VIDES = new Set([
  'de', 'du', 'des', 'le', 'la', 'les', 'l', 'd', 'un', 'une', 'pour', 'a', 'au', 'aux', 'et', 'en', 'sur', 'mon', 'ma', 'mes', 'ce', 'cet', 'cette', 'est', 'c', 'chez', 'ref', 'reference',
  'numero', 'num', 'no', 'n', 'date', 'dans', 'par', 'avec', 'sans', 'concerne', 'voici', 'voila', 'svp', 'stp', 'merci', 'scan', 'scanne', 'document', 'doc', 'fichier', 'piece', 'image',
  'verso', 'recto', 'suite', 'annexe', 'annexes', 'page', 'pages', 'euro', 'euros', 'eur', 'qui', 'que', 'ci', 'joint',
])

const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre']

const deux = (n: number) => String(n).padStart(2, '0')
const jourValide = (a: number, m: number, j: number) => m >= 1 && m <= 12 && j >= 1 && j <= new Date(a, m, 0).getDate()

/** Cherche la PREMIÈRE date du texte (déjà sans accent ni majuscule) ; renvoie la date ISO et le texte sans elle. */
function extraireDate(t: string, aujourdhui: string): { date: string | null; reste: string } {
  const [aa, am, aj] = aujourdhui.split('-').map(Number)
  const complete = (annee: number | null, m: number, j: number): string | null => {
    let a = annee ?? aa
    if (annee == null && (m > am || (m === am && j > aj))) a -= 1 // « 5 décembre » en octobre : l'an dernier
    return jourValide(a, m, j) ? `${a}-${deux(m)}-${deux(j)}` : null
  }
  const trouvees: Array<{ index: number; texte: string; date: string }> = []
  const ajoute = (re: RegExp, versDate: (m: RegExpExecArray) => string | null) => {
    for (const m of t.matchAll(new RegExp(re, 'g'))) { const d = versDate(m as RegExpExecArray); if (d) trouvees.push({ index: m.index ?? 0, texte: m[0], date: d }) }
  }
  ajoute(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, m => (jourValide(+m[1], +m[2], +m[3]) ? `${m[1]}-${deux(+m[2])}-${deux(+m[3])}` : null))
  ajoute(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/, m => {
    const annee = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    return jourValide(annee, +m[2], +m[1]) ? `${annee}-${deux(+m[2])}-${deux(+m[1])}` : null
  })
  ajoute(new RegExp(`\\b(1er|\\d{1,2})\\s+(${MOIS.join('|')})(?:\\s+(\\d{4}))?\\b`), m => complete(m[3] ? +m[3] : null, MOIS.indexOf(m[2]) + 1, m[1] === '1er' ? 1 : +m[1]))
  ajoute(new RegExp(`\\b(${MOIS.join('|')})\\s+(\\d{4})\\b`), m => `${m[2]}-${deux(MOIS.indexOf(m[1]) + 1)}-01`)
  ajoute(/\baujourd\s?hui\b/, () => aujourdhui)
  const premiere = trouvees.sort((x, y) => x.index - y.index)[0]
  return premiere ? { date: premiere.date, reste: t.replace(premiere.texte, ' ') } : { date: null, reste: t }
}

const estPlaque = (tok: string) => /^[a-z]{2}-?\d{3}-?[a-z]{2}$/.test(tok)
const formaterPlaque = (tok: string) => { const k = cleePlaque(tok); return `${k.slice(0, 2)}-${k.slice(2, 5)}-${k.slice(5)}` }

/** Deux mots désignent la même chose : identiques, l'un début de l'autre (4 lettres), ou une faute de frappe sur un mot de 5 lettres ou plus. */
const lie = (a: string, b: string) =>
  a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) || (a.length >= 5 && b.length >= 5 && distance(a, b, 1) <= 1)

/**
 * Nom connu dont les mots sont tous dans le texte (« lucas bacher » ↔ « Bacher Lucas ») ; à défaut, le seul nom dont un mot
 * (`minSolo` lettres) y figure : « le permis de Marie » → la seule Marie des fiches.
 */
function trouverConnu(mots: readonly string[], noms: readonly string[], minSolo: number): { nom: string; utilises: string[] } | null {
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
  const solo = (nom: string) => normal(nom).split(' ').find(w => w.length >= minSolo && mots.some(t => (t.length >= minSolo ? lie(t, w) : false)))
  const uniques = noms.filter(nom => solo(nom))
  if (uniques.length === 1) {
    const w = solo(uniques[0])!
    return { nom: uniques[0], utilises: [mots.find(t => lie(t, w))!] }
  }
  return null
}

/** Rattrape les fautes de frappe sur les mots-clés (« permi », « facure ») sans toucher aux noms des fiches. */
function corrigerFautes(brut: string, protege: ReadonlySet<string>): string {
  return brut.split(' ').map(tok => {
    if (tok.length < 5 || VOCABULAIRE.includes(tok) || protege.has(tok)) return tok
    const max = tok.length >= 9 ? 2 : 1
    let meilleur: string | null = null
    let dMeilleur = max + 1
    let egalite = false
    for (const w of VOCABULAIRE) {
      const d = distance(tok, w, max)
      if (d < dMeilleur) { meilleur = w; dMeilleur = d; egalite = false } else if (d === dMeilleur && meilleur !== w) egalite = true
    }
    return meilleur && !egalite ? meilleur : tok
  }).join(' ')
}

/** Montant écrit dans la phrase (« 12,50 € », « 150 euros »), en centimes ; le texte revient sans lui. */
function extraireMontant(t: string): { cts: number | null; reste: string } {
  const m = /(\d+(?:[.,]\d{1,2})?)\s?(?:€|eur\b|euros?\b)/.exec(t)
  if (!m) return { cts: null, reste: t }
  const n = Number(m[1].replace(',', '.'))
  return { cts: Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null, reste: t.replace(m[0], ' ') }
}

/**
 * Comprend une phrase décrivant un document. `null` = type introuvable (rien à appliquer ; voir `suggererTypes`).
 * Tiers : fiche connue (client, fournisseur ou salarié selon le type), sinon le texte restant en MAJUSCULES, sinon l'origine du document.
 * Sans type dans la phrase : le type habituel du tiers (d'après les documents déjà rangés).
 */
export function analyserDescription(texte: string, ref: Referents, aujourdhui: string, opts: OptionsDescription = {}): Description | null {
  const sansAccent = texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const partie = partieDuTexte(texte)
  const { cts: montant, reste: sansMontant } = extraireMontant(sansAccent)
  // Plusieurs dates : la première est celle du document, les autres sont retirées du texte.
  let t = sansMontant.replace(/n\s*°\s*/g, ' ').replace(/[,;]/g, ' ').replace(/\b(?:page|p)\s?\d{1,2}\b/g, ' ')
  let date: string | null = null
  for (let i = 0; i < 3; i++) { const r = extraireDate(t, aujourdhui); if (r.date == null) break; date ??= r.date; t = r.reste }

  // Mots de la phrase : abréviations dépliées, fautes rattrapées (sauf les noms des fiches).
  const protege = new Set([...ref.clients, ...ref.fournisseurs, ...ref.salaries].flatMap(n => normal(n).split(' ')))
  const brutMots = normal(t).split(' ').filter(Boolean).map(w => ABREVIATIONS[w] ?? w).join(' ')
  const brut = corrigerFautes(brutMots, protege)

  let cle: string | null = opts.type && typeDe(opts.type) ? opts.type : null
  let motType = ''
  if (!cle) for (const [re, c] of MOTS_TYPE) { const m = re.exec(brut); if (m) { cle = c; motType = m[0]; break } }

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
  const corrigesRestants = corrigerFautes(normal(restants.map(w => ABREVIATIONS[normal(w)] ?? w).join(' ')), protege)
  const motsType = new Set(normal(motType).split(' '))
  const candidats = corrigesRestants.split(' ').filter(w => w && !motsType.has(w) && !MOTS_VIDES.has(w) && !(VOCABULAIRE.includes(w) && w !== 'transport'))

  // Tiers connu : les fiches qui correspondent au type, puis toutes les autres.
  const listes: Array<{ noms: string[]; solo: number }> = !cle ? [{ noms: ref.fournisseurs, solo: 4 }, { noms: ref.clients, solo: 4 }, { noms: ref.salaries, solo: 3 }]
    : TYPES_SALARIE.has(cle) ? [{ noms: ref.salaries, solo: 3 }, { noms: ref.clients, solo: 4 }, { noms: ref.fournisseurs, solo: 4 }]
      : cle === 'facture' || TYPES_CLIENT.has(cle) ? [{ noms: ref.clients, solo: 4 }, { noms: ref.fournisseurs, solo: 4 }, { noms: ref.salaries, solo: 3 }]
        : [{ noms: ref.fournisseurs, solo: 4 }, { noms: ref.clients, solo: 4 }, { noms: ref.salaries, solo: 3 }]
  let tiers: string | null = null
  let origine = -1
  for (let i = 0; i < listes.length && tiers == null; i++) {
    const r = trouverConnu(candidats, listes[i].noms, listes[i].solo)
    if (r) { tiers = r.nom; origine = i }
  }
  let tiersConnu = tiers != null

  // Pas de type dans la phrase : le type habituel du tiers (ex. toujours des factures), sinon rien à appliquer.
  let typeParHabitude = false
  if (!cle) {
    const h = typeHabituel(opts.classes ?? [], tiers)
    if (!h) return null
    cle = h
    typeParHabitude = true
  }

  if (tiers == null) {
    const nom = candidats.join(' ').trim()
    tiers = nom ? nom.toUpperCase() : null
  }

  let type = cle
  if (cle === 'facture') {
    const h = typeHabituel(opts.classes ?? [], tiers)
    type = h === 'facture_client' || h === 'facture_fournisseur' ? h : origine === 0 && listes[0].noms === ref.clients ? 'facture_client' : 'facture_fournisseur'
  }

  // L'origine du document complète les cases vides (permis sans nom → le salarié de la fiche…).
  const o = completerDepuisOrigine({ type, tiers, vehicule }, opts.origine ?? SANS_ORIGINE)
  if (tiers == null && o.tiers) tiersConnu = true
  return { type, tiers: o.tiers, tiersConnu, date, reference, vehicule: o.vehicule, partie, montant_ttc_cts: montant, parOrigine: o.parOrigine, typeParHabitude }
}

/** Les types les plus proches d'une phrase : si le type n'est pas reconnu, l'écran propose 3 boutons. */
export function suggererTypes(texte: string, classes: readonly ClasseHistorique[] = [], max = 3): string[] {
  const mots = normal(texte).split(' ').filter(w => w.length >= 3 && !MOTS_VIDES.has(w))
  const scores = TYPES_DOCUMENT.map(t => {
    const motsType = normal(`${t.libelle} ${t.nom}`).split(' ').filter(w => w.length >= 3)
    const score = mots.reduce((s, w) => s + (motsType.some(x => x === w || (w.length >= 3 && x.startsWith(w)) || (w.length >= 5 && x.length >= 5 && distance(w, x, 2) <= 2)) ? 1 : 0), 0)
    return { cle: t.cle, score }
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score)
  const sortie = scores.map(x => x.cle)
  // Complète avec les types les plus rangés par l'utilisateur, puis les plus courants.
  const frequents = new Map<string, number>()
  for (const c of classes) if (c.type_document) frequents.set(c.type_document, (frequents.get(c.type_document) ?? 0) + 1)
  const ordre = [...[...frequents].sort((a, b) => b[1] - a[1]).map(x => x[0]), 'facture_fournisseur', 'facture_client', 'attestation', 'courrier_administratif']
  for (const c of ordre) if (!sortie.includes(c) && typeDe(c)) sortie.push(c)
  return sortie.slice(0, max)
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
  classes: readonly ClasseHistorique[] = [],
): PropositionDocument {
  const dateDepot = doc.created_at.slice(0, 10)
  const choix = choisirChemin(
    { type: d.type, date: d.date ?? (typeDe(d.type)?.intemporel ? null : dateDepot), tiers: d.tiers, vehicule: d.vehicule, parOrigine: d.parOrigine }, { classes, existants })
  const chemin = aligner(choix?.chemin ?? ['A traiter'], existants)
  return {
    type: d.type, date: d.date, tiers: d.tiers, tiers_connu: d.tiersConnu, montant_ttc_cts: d.montant_ttc_cts, reference: d.reference, resume: null,
    confiance: { type: 1, date: 1, tiers: 1, montant: 1 },
    nom: nomPropose({ date: d.date, dateDepot, type: d.type, tiers: d.tiers, reference: d.reference, partie: d.partie }, doc.file_name, pris),
    vehicule: d.vehicule, partie: d.partie, chemin, chemin_nouveaux: niveauxNouveaux(chemin, existants), chemin_confiance: 1, chemin_via: choix?.via ?? 'transit', alternatives: [],
    lu_via: 'saisie', propose_le: new Date().toISOString(),
  }
}

/** Date du jour en local (AAAA-MM-JJ), jamais `toISOString` (la veille avant 2 h). */
export function aujourdhuiLocal(d = new Date()): string {
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
}
