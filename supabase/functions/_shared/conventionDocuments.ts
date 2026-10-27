// Convention de nommage et de classement des documents de MCA Logistics — PUR (aucun import, aucun Deno.*), testé par vitest.
// Source : Google Doc « CONVENTION DE NOMMAGE & CIRCUIT » (08/09/2026) et arborescence réelle de « MCA Documents ».
// COPIE EXACTE côté site : `src/shared/lib/conventionDocuments.ts` (un test compare les deux fichiers octet pour octet).
//
// Nom :   [DATE_]TYPE_TIERS[_NUMERO].ext   en MAJUSCULES, tirets dans un bloc, « _ » entre les blocs.
// Date :  imprimée sur le document ; sinon date du dépôt ; sinon RIEN pour un type « intemporel » (KBIS, STATUTS, RIB…).
// Dossier : table de règles « nature du document → dossier officiel » ; aucune règle → l'IA choisit, sinon « A traiter ».

export interface TypeDocument {
  cle: string
  libelle: string
  /** Bloc TYPE du nom de fichier (MAJUSCULES, tirets). */
  nom: string
  /** Dossier officiel de premier niveau dans le Drive (affiché à côté du type). */
  dossier: string
  /** Sans date imprimée, le nom n'a pas de date (statuts, Kbis, RIB…). */
  intemporel?: boolean
  /** Pièce personnelle ou secrète : jamais envoyée à l'IA, rangée d'après son nom. */
  sensible?: boolean
}

const CF = 'Comptabilite & finances'

export const TYPES_DOCUMENT: readonly TypeDocument[] = [
  { cle: 'facture_client', libelle: 'Facture client', nom: 'FACTURE', dossier: CF },
  { cle: 'avoir', libelle: 'Avoir', nom: 'AVOIR', dossier: CF },
  { cle: 'acompte', libelle: 'Acompte', nom: 'ACOMPTE', dossier: CF },
  { cle: 'devis', libelle: 'Devis', nom: 'DEVIS', dossier: CF },
  { cle: 'bon_commande', libelle: 'Bon de commande', nom: 'BON-COMMANDE', dossier: CF },
  { cle: 'bon_livraison', libelle: 'Bon de livraison', nom: 'BON-LIVRAISON', dossier: CF },
  { cle: 'facture_fournisseur', libelle: 'Facture fournisseur', nom: 'FACTURE', dossier: CF },
  { cle: 'ticket', libelle: 'Ticket / reçu', nom: 'TICKET', dossier: CF },
  { cle: 'lettre_de_voiture', libelle: 'Lettre de voiture / CMR', nom: 'LETTRE-VOITURE', dossier: CF },
  { cle: 'ordre_transport', libelle: 'Ordre de transport', nom: 'ORDRE-TRANSPORT', dossier: CF },
  { cle: 'preuve_livraison', libelle: 'Preuve de livraison', nom: 'PREUVE-LIVRAISON', dossier: 'Transport' },
  { cle: 'feuille_de_route', libelle: 'Feuille de route', nom: 'FEUILLE-DE-ROUTE', dossier: 'Transport' },
  { cle: 'synthese_tournee', libelle: 'Synthèse de tournée', nom: 'SYNTHESE-TOURNEE', dossier: 'Transport' },
  { cle: 'charte', libelle: 'Charte / déclaration de sûreté', nom: 'CHARTE-PARTENARIAT', dossier: CF, intemporel: true },
  { cle: 'releve_bancaire', libelle: 'Relevé bancaire', nom: 'RELEVE', dossier: 'Banque' },
  { cle: 'rib', libelle: 'RIB / IBAN', nom: 'RIB', dossier: 'Banque', intemporel: true },
  { cle: 'contrat', libelle: 'Contrat', nom: 'CONTRAT', dossier: CF, intemporel: true },
  { cle: 'avenant', libelle: 'Avenant', nom: 'AVENANT', dossier: CF },
  { cle: 'assurance', libelle: 'Assurance', nom: 'ASSURANCE', dossier: 'Assurances' },
  { cle: 'attestation', libelle: 'Attestation', nom: 'ATTESTATION', dossier: 'A traiter' },
  { cle: 'courrier_administratif', libelle: 'Courrier administratif', nom: 'COURRIER', dossier: 'A traiter' },
  { cle: 'fiscal_social', libelle: 'Impôts / TVA / URSSAF', nom: 'DECLARATION', dossier: 'Fiscal' },
  { cle: 'pv', libelle: 'Procès-verbal / décision', nom: 'PV', dossier: 'Statuts et Actes' },
  { cle: 'statuts', libelle: 'Statuts', nom: 'STATUTS', dossier: 'Statuts et Actes', intemporel: true },
  { cle: 'kbis', libelle: 'Kbis / RBE', nom: 'KBIS', dossier: 'Identite Legale', intemporel: true },
  { cle: 'capacite_transport', libelle: 'Capacité de transport', nom: 'CAPACITE-TRANSPORT', dossier: 'Transport et Reglementaire' },
  { cle: 'licence', libelle: 'Licence de transport', nom: 'LICENCE', dossier: 'Transport et Reglementaire' },
  { cle: 'carte_grise', libelle: 'Carte grise', nom: 'CARTE-GRISE', dossier: 'Vehicules et Flotte' },
  { cle: 'certificat_cession', libelle: 'Certificat de cession', nom: 'CERTIFICAT-CESSION', dossier: 'Vehicules et Flotte' },
  { cle: 'controle_technique', libelle: 'Contrôle technique', nom: 'CONTROLE-TECHNIQUE', dossier: 'Vehicules et Flotte' },
  { cle: 'document_vehicule', libelle: 'Autre document véhicule', nom: 'DOCUMENT-VEHICULE', dossier: 'Vehicules et Flotte' },
  { cle: 'amende', libelle: 'Amende / PV', nom: 'AMENDE', dossier: 'Vehicules et Flotte' },
  { cle: 'contestation', libelle: 'Contestation d\'amende', nom: 'CONTESTATION', dossier: 'Vehicules et Flotte' },
  { cle: 'avis_paiement', libelle: 'Avis de paiement', nom: 'AVIS-PAIEMENT', dossier: CF },
  { cle: 'paie', libelle: 'Bulletin de paie', nom: 'BULLETIN-PAIE', dossier: 'Social et RH' },
  { cle: 'dpae', libelle: 'DPAE / contrat de travail', nom: 'DPAE', dossier: 'Social et RH' },
  { cle: 'document_salarie', libelle: 'Autre document salarié', nom: 'DOCUMENT-SALARIE', dossier: 'Social et RH' },
  { cle: 'identite', libelle: 'Pièce d\'identité', nom: 'CNI', dossier: 'Social et RH', sensible: true },
  { cle: 'permis', libelle: 'Permis de conduire', nom: 'PERMIS-CONDUIRE', dossier: 'Social et RH', sensible: true },
  { cle: 'casier', libelle: 'Casier judiciaire', nom: 'CASIER-JUDICIAIRE', dossier: 'Social et RH', sensible: true },
  { cle: 'carte_vitale', libelle: 'Carte Vitale', nom: 'CARTE-VITALE', dossier: 'Social et RH', sensible: true },
  { cle: 'codes_acces', libelle: 'Codes d\'accès / 2FA', nom: 'CODES-ACCES', dossier: 'Sécurité', intemporel: true, sensible: true },
  { cle: 'modele', libelle: 'Modèle / formulaire vierge', nom: 'MODELE', dossier: 'Modèle', intemporel: true },
  { cle: 'photo', libelle: 'Photo', nom: 'PHOTO', dossier: 'A traiter' },
  { cle: 'autre', libelle: 'Autre', nom: 'DOCUMENT', dossier: 'A traiter' },
] as const

/** Types écrits avant la convention : plus proposés, mais encore lisibles dans l'Historique. */
const TYPES_ANCIENS: Record<string, TypeDocument> = {
  statuts_kbis: { cle: 'statuts_kbis', libelle: 'Statuts / Kbis', nom: 'KBIS', dossier: 'Identite Legale', intemporel: true },
}

export const CLES_TYPE = TYPES_DOCUMENT.map(t => t.cle)

export const typeDe = (cle: string | null | undefined): TypeDocument | undefined =>
  TYPES_DOCUMENT.find(t => t.cle === cle) ?? (cle ? TYPES_ANCIENS[cle] : undefined)

export function libelleType(cle: string | null | undefined): string {
  return typeDe(cle)?.libelle ?? 'Autre'
}

// ── Nom du fichier ──────────────────────────────────────────────────────────

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** « Client C » → « CLIENT-C » ; points conservés (E.LECLERC), tirets autorisés ; 30 caractères au plus. */
export function bloc(s: string | null | undefined, max = 30): string {
  const propre = sansAccents(s ?? '').toUpperCase().replace(/[^A-Z0-9.-]+/g, '-').replace(/-{2,}/g, '-').replace(/^[-.]+|[-.]+$/g, '')
  return propre.slice(0, max).replace(/[-.]+$/, '')
}

export function extensionDe(nom: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(nom.trim())
  return m ? `.${m[1].toLowerCase()}` : ''
}

export interface ElementsNom {
  /** Date imprimée sur le document. */
  date?: string | null
  /** Date du dépôt : sert quand le document n'a pas de date imprimée (sauf type intemporel). */
  dateDepot?: string | null
  type?: string | null
  tiers?: string | null
  reference?: string | null
  /** Le montant ne figure PAS dans le nom (il reste dans la fiche du document) ; accepté pour ne rien casser. */
  montant_ttc_cts?: number | null
  /** Partie du document : VERSO, RECTO, P2, SUITE, ANNEXE… (dernier bloc du nom). */
  partie?: string | null
}

/** Types qui n'ont jamais de « pages » : deux noms identiques = deux documents distincts (-2), pas recto / verso. */
const SANS_PARTIES = new Set(['ticket', 'photo', 'autre', 'feuille_de_route', 'synthese_tournee', 'preuve_livraison', 'amende'])
/** Types à deux faces : le deuxième document de même nom est proposé en VERSO. */
const DEUX_FACES = new Set(['identite', 'permis', 'carte_vitale', 'carte_grise'])

/**
 * Nom rangé : `[AAAA-MM-JJ_]TYPE_TIERS[_NUMERO][_PARTIE].ext`. Blocs absents sautés.
 * `pris` = noms déjà utilisés (minuscules) : si le nom existe déjà, le document est proposé en VERSO (pièces à deux faces)
 * ou en P2, P3… (documents de plusieurs pages) ; sinon -2, -3… pour ne jamais en avoir deux identiques.
 */
export function nomPropose(e: ElementsNom, nomActuel: string, pris: ReadonlySet<string> = new Set()): string {
  const t = typeDe(e.type)
  const date = e.date || (t?.intemporel ? null : e.dateDepot) || null
  const morceaux = [date, t?.nom ?? 'DOCUMENT', bloc(e.tiers), bloc(e.reference, 24)].filter(Boolean) as string[]
  const ext = extensionDe(nomActuel)
  const avec = (partie: string | null) => `${[...morceaux, partie].filter(Boolean).join('_')}${ext}`
  const partie = bloc(e.partie, 12) || null
  let nom = avec(partie)
  if (!pris.has(nom.toLowerCase())) return nom
  if (!partie && !SANS_PARTIES.has(e.type ?? '')) {
    const suites = [...(DEUX_FACES.has(e.type ?? '') ? ['VERSO'] : []), ...Array.from({ length: 8 }, (_, i) => `P${i + 2}`)]
    for (const p of suites) { nom = avec(p); if (!pris.has(nom.toLowerCase())) return nom }
  }
  const base = nom.slice(0, nom.length - ext.length)
  for (let i = 2; ; i++) { nom = `${base}-${i}${ext}`; if (!pris.has(nom.toLowerCase())) return nom }
}

/** Partie d'un document d'après un texte (nom de fichier ou phrase) : « verso », « recto verso », « page 2 », « p3 », « suite », « annexe ». */
export function partieDuTexte(texte: string): string | null {
  const n = normal(texte)
  if (/\brecto (et )?verso\b/.test(n)) return 'RECTO-VERSO'
  if (/\bverso\b/.test(n)) return 'VERSO'
  if (/\brecto\b/.test(n)) return 'RECTO'
  const p = /\b(?:page|p)\s?(\d{1,2})\b/.exec(n)
  if (p) return `P${Number(p[1])}`
  if (/\bsuite\b/.test(n)) return 'SUITE'
  if (/\bannexes?\b/.test(n)) return 'ANNEXE'
  return null
}

// ── Pièces sensibles : reconnues d'après le NOM, jamais envoyées à l'IA ─────────────────────────────────────

const normal = (s: string) => sansAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const MOTIFS_SENSIBLES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(carte (d )?identite|cni|passeport|piece identite)\b/, 'identite'],
  [/\bpermis( de conduire| conduire)?\b/, 'permis'],
  [/\bcasier\b|\bnon condamnation\b/, 'casier'],
  [/\bcarte vitale\b|\bvitale\b/, 'carte_vitale'],
  [/\bcodes? (d )?acces\b|\bcodes? (2fa|secours)\b|\bmots? de passe\b|\b2fa\b/, 'codes_acces'],
]

/** Type d'une pièce sensible d'après son nom de fichier (« Carte identité DUPONT.pdf » → identite), sinon null. */
export function typeSensibleDuNom(nomFichier: string): string | null {
  const n = normal(nomFichier.replace(/\.[A-Za-z0-9]{1,5}$/, ''))
  for (const [re, cle] of MOTIFS_SENSIBLES) if (re.test(n)) return cle
  return null
}

/** Salarié dont tous les mots du nom (3 lettres au moins) sont dans le nom du fichier, sinon null. */
export function salarieDuNom(nomFichier: string, salaries: readonly string[]): string | null {
  const n = ` ${normal(nomFichier)} `
  for (const s of salaries) {
    const mots = normal(s).split(' ').filter(m => m.length >= 3)
    if (mots.length >= 2 && mots.every(m => n.includes(` ${m} `) || n.includes(m))) return s
  }
  return null
}

// ── Dossier officiel ────────────────────────────────────────────────────────

export const SANS_DATE = 'Sans date'

/** Plaque normalisée (« ab-123 cd » → « AB123CD ») pour comparer une plaque lue à celles de la flotte. */
export const cleePlaque = (s: string | null | undefined): string => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Nom d'un dossier à créer : sans caractère interdit, MAJUSCULES comme les dossiers clients du Drive. */
const dossierTiers = (s: string): string => s.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60).toUpperCase()

/** Dossier d'un véhicule déjà présent sous `parent` (nom contenant la plaque : « RENAULT TRAFIC AB-123-CD »), sinon la plaque seule. */
export function dossierVehicule(plaque: string, parent: readonly string[], existants: ReadonlyArray<readonly string[]>): string {
  const k = cleePlaque(plaque)
  const trouve = existants.find(e => e.length === parent.length + 1 && parent.every((p, i) => normal(p) === normal(e[i])) && cleePlaque(e[parent.length]).includes(k))
  return trouve ? trouve[parent.length] : plaque
}

export interface ElementsChemin {
  type?: string | null
  /** Date imprimée, à défaut celle du dépôt. */
  date?: string | null
  tiers?: string | null
  /** Plaque d'un véhicule de la flotte. */
  vehicule?: string | null
}

/**
 * Dossier officiel d'après le tableau « Où je classe » de la convention. `null` = aucune règle (ou information manquante,
 * par exemple une amende sans véhicule connu) : c'est alors l'IA qui choisit parmi les dossiers existants.
 */
export function cheminConvention(e: ElementsChemin, existants: ReadonlyArray<readonly string[]> = []): string[] | null {
  const date = e.date && /^\d{4}-\d{2}-\d{2}/.test(e.date) ? e.date : null
  const mois = date ? date.slice(0, 7) : SANS_DATE
  const annee = date ? date.slice(0, 4) : SANS_DATE
  const tiers = e.tiers?.trim() ? dossierTiers(e.tiers) : null
  const veh = (parent: readonly string[]) => (e.vehicule ? dossierVehicule(e.vehicule, parent, existants) : null)
  const flotte = ['Vehicules et Flotte']
  switch (e.type) {
    case 'facture_client': case 'avoir': case 'acompte': case 'devis': case 'bon_commande': case 'bon_livraison':
    case 'lettre_de_voiture': case 'ordre_transport':
      return tiers ? [CF, 'Clients', tiers, mois] : null
    case 'charte': return tiers ? [CF, 'Clients', tiers] : null
    case 'contrat': return tiers ? [CF, 'Clients', tiers, 'Contrats et chartes'] : null
    case 'facture_fournisseur': case 'ticket':
      return tiers ? [CF, 'Fournisseurs', tiers] : null
    case 'amende': case 'contestation': { const v = veh(flotte); return v ? [...flotte, v, 'Amendes'] : null }
    case 'avis_paiement': {
      const v = veh(flotte)
      return v ? [...flotte, v, 'Amendes'] : tiers ? [CF, 'Clients', tiers, mois] : null
    }
    case 'carte_grise': { const v = veh(flotte); return v ? [...flotte, v, 'Carte grise'] : null }
    case 'certificat_cession': { const v = veh(flotte); return v ? [...flotte, v, 'Certificat de cession'] : null }
    case 'controle_technique': { const v = veh(flotte); return v ? [...flotte, v, 'Contrôle technique'] : null }
    case 'document_vehicule': { const v = veh(flotte); return v ? [...flotte, v] : null }
    case 'assurance': { const p = ['Assurances', 'Flotte automobile']; const v = veh(p); return v ? [...p, v] : ['Assurances'] }
    case 'capacite_transport': return ['Transport et Reglementaire', 'Capacite professionnelle de transport']
    case 'licence': return ['Transport et Reglementaire', 'Licence de Transport']
    case 'fiscal_social': return ['Fiscal', 'Documents', annee]
    case 'paie': case 'dpae': case 'document_salarie': case 'identite': case 'permis': case 'casier': case 'carte_vitale':
      return tiers ? ['Social et RH', 'Salaries', tiers] : ['Social et RH', 'Salaries']
    case 'kbis': case 'statuts_kbis': return ['Identite Legale', 'KBis et RBE']
    case 'statuts': return ['Statuts et Actes', 'Statuts en vigueur']
    case 'pv': return ['Statuts et Actes', 'PV Assemblees']
    case 'releve_bancaire': return ['Banque', 'Qonto Compte principal', 'Releves mensuels']
    case 'rib': return ['Banque']
    case 'modele': return ['Modèle']
    case 'codes_acces': return ['Sécurité']
    default: return null
  }
}

/** Dossier de transit de la convention (« À traiter ») : rien ne correspond, tu choisis. */
export const DOSSIER_TRANSIT = 'A traiter'

/** Chemin à proposer sans l'avis de l'IA : la règle de la convention, sinon le dossier de transit. */
export function cheminDefaut(e: ElementsChemin, existants: ReadonlyArray<readonly string[]> = []): string[] {
  return cheminConvention(e, existants) ?? [DOSSIER_TRANSIT]
}

// ── Origine du document : de qui / de quoi il vient ─────────────────────────────────────────────────────

export const TYPES_SALARIE: ReadonlySet<string> = new Set(['permis', 'identite', 'casier', 'carte_vitale', 'paie', 'dpae', 'document_salarie'])
export const TYPES_VEHICULE: ReadonlySet<string> = new Set(['carte_grise', 'certificat_cession', 'controle_technique', 'document_vehicule', 'amende', 'contestation', 'assurance'])
export const TYPES_CLIENT: ReadonlySet<string> = new Set(['facture_client', 'avoir', 'acompte', 'devis', 'bon_commande', 'bon_livraison', 'lettre_de_voiture', 'ordre_transport', 'charte', 'contrat'])

/** Noms des fiches par identifiant (le site et l'Edge les chargent ; ce fichier ne lit aucune base). */
export interface Annuaire {
  salaries: Record<string, string>
  /** Profil de connexion → salarié (pour « déposé par »). */
  salariesParProfil: Record<string, string>
  vehicules: Record<string, string>
  clients: Record<string, string>
}

export interface Origine {
  salarie: string | null
  vehicule: string | null
  client: string | null
  /** Salarié qui a déposé le fichier (compte de connexion). */
  deposePar: string | null
}

export const SANS_ORIGINE: Origine = { salarie: null, vehicule: null, client: null, deposePar: null }

/** Ce que l'origine du document apprend : fiche salarié, véhicule, client, livraison (son client), sinon « déposé par ». */
export function origineDuDocument(
  doc: { entity_type?: string | null; entity_id?: string | null; uploaded_by?: string | null },
  a: Annuaire,
  clientDeLaLivraison: string | null = null,
): Origine {
  const id = doc.entity_id ?? ''
  return {
    salarie: doc.entity_type === 'team_member' ? a.salaries[id] ?? null : null,
    vehicule: doc.entity_type === 'vehicle' ? a.vehicules[id] ?? null : null,
    client: doc.entity_type === 'client' ? a.clients[id] ?? null : doc.entity_type === 'delivery' ? clientDeLaLivraison : null,
    deposePar: doc.uploaded_by ? a.salariesParProfil[doc.uploaded_by] ?? null : null,
  }
}

/**
 * L'origine COMPLÈTE les cases vides (jamais ce que le document ou la description dit) : un permis sans nom → le salarié de la fiche
 * (à défaut celui qui l'a déposé), une pièce de véhicule sans plaque → le véhicule de la fiche, un devis sans tiers → le client de la fiche.
 */
export function completerDepuisOrigine(
  e: { type?: string | null; tiers?: string | null; vehicule?: string | null }, o: Origine,
): { tiers: string | null; vehicule: string | null; parOrigine: boolean } {
  let tiers = e.tiers?.trim() ? e.tiers : null
  let vehicule = e.vehicule?.trim() ? e.vehicule : null
  let parOrigine = false
  const t = e.type ?? ''
  if (!tiers && TYPES_SALARIE.has(t) && (o.salarie ?? o.deposePar)) { tiers = (o.salarie ?? o.deposePar)!; parOrigine = true }
  if (!tiers && TYPES_CLIENT.has(t) && o.client) { tiers = o.client; parOrigine = true }
  if (!vehicule && TYPES_VEHICULE.has(t) && o.vehicule) { vehicule = o.vehicule; parOrigine = true }
  return { tiers, vehicule, parOrigine }
}

// ── Habitudes : ce que l'utilisateur a déjà rangé (documents classés) ─────────────────────────────────────

export interface ClasseHistorique {
  type_document?: string | null
  tiers?: string | null
  /** Dossier du Drive, écrit « A / B / C » (du plus récent au plus ancien dans la liste fournie). */
  drive_chemin?: string | null
}

const SANS_DATE_RE = /^(\d{4}(-\d{2})?|Sans date)$/

/** Dossier habituel d'un (type, tiers) : le plus fréquent dans l'historique, à la date du document (dossier AAAA-MM / AAAA suivi). */
export function cheminHabituel(
  classes: readonly ClasseHistorique[], e: { type?: string | null; tiers?: string | null; date?: string | null },
  existants: ReadonlyArray<readonly string[]> = [],
): string[] | null {
  if (!e.type || !e.tiers?.trim()) return null
  const tiers = normal(e.tiers)
  const compte = new Map<string, { base: string[]; fin: 'M' | 'A' | ''; n: number }>()
  for (const c of classes) {
    if (c.type_document !== e.type || !c.tiers || normal(c.tiers) !== tiers || !c.drive_chemin) continue
    const seg = c.drive_chemin.split(/\s*\/\s*/).filter(Boolean)
    if (seg.length === 0) continue
    const dernier = seg[seg.length - 1]
    const fin = SANS_DATE_RE.test(dernier) ? (/^\d{4}$/.test(dernier) ? 'A' : 'M') : ''
    const base = fin ? seg.slice(0, -1) : seg
    if (base.length === 0) continue
    const cle = `${base.join('/')}|${fin}`
    const x = compte.get(cle)
    if (x) x.n++; else compte.set(cle, { base, fin, n: 1 })
  }
  let meilleur: { base: string[]; fin: 'M' | 'A' | ''; n: number } | null = null
  for (const x of compte.values()) if (!meilleur || x.n > meilleur.n) meilleur = x
  if (!meilleur) return null
  if (existants.length > 0) {
    const b = meilleur.base
    const existe = existants.some(ex => ex.length === b.length && b.every((x, i) => normal(x) === normal(ex[i])))
    if (!existe) return null
  }
  const date = e.date && /^\d{4}-\d{2}/.test(e.date) ? e.date : null
  const fin = meilleur.fin === 'M' ? [date ? date.slice(0, 7) : SANS_DATE] : meilleur.fin === 'A' ? [date ? date.slice(0, 4) : SANS_DATE] : []
  return [...meilleur.base, ...fin]
}

/** Type habituel d'un tiers : celui de la plupart de ses documents rangés (au moins 2, et 70 % des siens). */
export function typeHabituel(classes: readonly ClasseHistorique[], tiers: string | null | undefined): string | null {
  if (!tiers?.trim()) return null
  const k = normal(tiers)
  const n = new Map<string, number>()
  let total = 0
  for (const c of classes) {
    if (!c.type_document || !c.tiers || normal(c.tiers) !== k) continue
    total++
    n.set(c.type_document, (n.get(c.type_document) ?? 0) + 1)
  }
  let top: [string, number] | null = null
  for (const x of n) if (!top || x[1] > top[1]) top = x
  return top && top[1] >= 2 && top[1] / total >= 0.7 ? top[0] : null
}

/** Types dont le tiers ou le dossier est une personne : jamais donnés en exemple à l'IA. */
const TYPES_PERSONNELS: ReadonlySet<string> = new Set(['paie', 'dpae', 'document_salarie', 'identite', 'permis', 'casier', 'carte_vitale', 'codes_acces'])

/** Exemples « Type · tiers → dossier » pour l'IA : distincts, récents, sans pièce personnelle, sans montant ni nom de fichier. */
export function exemplesRangement(classes: readonly ClasseHistorique[], max = 25): string[] {
  const vus = new Set<string>()
  const sortie: string[] = []
  for (const c of classes) {
    if (sortie.length >= max) break
    if (!c.type_document || !c.tiers?.trim() || !c.drive_chemin || TYPES_PERSONNELS.has(c.type_document) || typeDe(c.type_document) === undefined) continue
    const seg = c.drive_chemin.split(/\s*\/\s*/).filter(Boolean)
    if (seg.length === 0 || /^(Social et RH|Direction|Sécurité|Securite)$/.test(seg[0])) continue
    const dernier = seg[seg.length - 1]
    const gen = SANS_DATE_RE.test(dernier) ? [...seg.slice(0, -1), /^\d{4}$/.test(dernier) ? 'AAAA' : 'AAAA-MM'] : seg
    const ligne = `${libelleType(c.type_document)} · ${c.tiers.trim().slice(0, 40)} → ${gen.join(' / ')}`
    if (vus.has(ligne)) continue
    vus.add(ligne)
    sortie.push(ligne)
  }
  return sortie
}

/**
 * Dossier proposé SANS l'IA, par ordre de confiance : l'habitude de l'utilisateur pour ce (type, tiers), puis la convention.
 * `via` dit pourquoi : « habitude », « origine » (le tiers ou le véhicule vient de la fiche d'où vient le document), « convention ».
 * `null` = aucune règle : l'appelant choisit (IA, sinon dossier de transit).
 */
export function choisirChemin(
  e: ElementsChemin & { parOrigine?: boolean },
  ctx: { classes?: readonly ClasseHistorique[]; existants?: ReadonlyArray<readonly string[]> } = {},
): { chemin: string[]; via: 'habitude' | 'origine' | 'convention' } | null {
  const existants = ctx.existants ?? []
  const habitude = cheminHabituel(ctx.classes ?? [], e, existants)
  if (habitude) return { chemin: habitude, via: 'habitude' }
  const regle = cheminConvention(e, existants)
  return regle ? { chemin: regle, via: e.parOrigine ? 'origine' : 'convention' } : null
}

// ── Fichiers déjà dans le Drive : nom conforme ?, origine d'après le dossier, dossiers confidentiels ───────────

/**
 * Le nom respecte-t-il déjà la convention `[AAAA-MM-JJ_]TYPE_TIERS[_NUMERO][_PARTIE].ext` ?
 * MAJUSCULES, chiffres, points et tirets dans chaque bloc, blocs séparés par « _ », au moins TYPE et TIERS, TYPE commençant par une lettre,
 * date complète (jour compris) ou pas de date du tout. Pas d'espace, pas de minuscule.
 */
export function estNomConforme(nomFichier: string): boolean {
  const sans = nomFichier.trim().replace(/\.[A-Za-z0-9]{1,5}$/, '')
  if (!sans || /\s/.test(sans)) return false
  let blocs = sans.split('_')
  if (/^\d{4}-\d{2}-\d{2}$/.test(blocs[0])) blocs = blocs.slice(1)
  else if (/^\d{4}(-\d{2})?$/.test(blocs[0])) return false
  if (blocs.length < 2 || !/^[A-Z]/.test(blocs[0])) return false
  // Noms d'appareil photo / scanner (IMG_3794, SCAN_0012…) : jamais conformes.
  if (/^(IMG|DSC|DSCN|PXL|SCAN|IMAGE|PHOTO|CAPTURE|SCREENSHOT|DOC|DOCUMENT|NEW)$/.test(blocs[0]) && blocs.slice(1).every(b => /^\d+$/.test(b))) return false
  return blocs.every(b => /^[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?$/.test(b))
}

/** Dossiers où l'IA ne lit JAMAIS les fichiers : sécurité, direction, social et RH (n'importe où dans le chemin). */
export function dossierConfidentiel(chemin: readonly string[]): boolean {
  return chemin.some(s => /^(securite|direction|social et rh)$/.test(normal(s)))
}

export interface OrigineDossier { client: string | null; fournisseur: string | null; vehicule: string | null; salarie: string | null }

const RE_PLAQUE = /\b([A-Z]{2})[- ]?(\d{3})[- ]?([A-Z]{2})\b/

/** Plaque trouvée dans un texte (« RENAULT TRAFIC AB-123-CD » → « AB-123-CD »), sinon null. */
export function plaqueDuTexte(texte: string): string | null {
  const m = RE_PLAQUE.exec(sansAccents(texte).toUpperCase())
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/**
 * Ce que le DOSSIER apprend sur ses fichiers (chemin depuis la racine du Drive) : Clients / <CLIENT>, Fournisseurs / <FOURNISSEUR>,
 * Vehicules et Flotte / <MARQUE MODELE PLAQUE> (ou Assurances / Flotte automobile / …), Social et RH / Salaries / <NOM>.
 */
export function origineDuDossier(chemin: readonly string[]): OrigineDossier {
  const o: OrigineDossier = { client: null, fournisseur: null, vehicule: null, salarie: null }
  const n = chemin.map(normal)
  const apres = (cle: string) => { const i = n.indexOf(cle); return i >= 0 && i + 1 < chemin.length ? chemin[i + 1] : null }
  o.client = apres('clients')
  o.fournisseur = apres('fournisseurs')
  o.salarie = apres('salaries')
  const v = apres('vehicules et flotte') ?? apres('flotte automobile')
  o.vehicule = v ? plaqueDuTexte(v) : null
  return o
}
