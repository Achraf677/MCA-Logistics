// Tri des documents par l'IA (onglet Documents) — règles PURES (aucun Deno.*, aucun fetch), testées par vitest.
// Miroir côté site : `src/shared/lib/documentsTri.ts` (même liste de types, même fabrique de nom) — un test compare les deux.
// L'IA PROPOSE (type, date, tiers, montant, référence, résumé) ; le nom proposé est fabriqué ici, jamais par l'IA ; l'utilisateur confirme.

export interface TypeDocument { cle: string; libelle: string; dossier: string }

export const TYPES_DOCUMENT: readonly TypeDocument[] = [
  { cle: 'facture_fournisseur', libelle: 'Facture fournisseur', dossier: 'Achats' },
  { cle: 'ticket', libelle: 'Ticket / reçu', dossier: 'Achats' },
  { cle: 'facture_client', libelle: 'Facture client', dossier: 'Ventes' },
  { cle: 'devis', libelle: 'Devis', dossier: 'Ventes' },
  { cle: 'lettre_de_voiture', libelle: 'Lettre de voiture / CMR', dossier: 'Transport' },
  { cle: 'preuve_livraison', libelle: 'Preuve de livraison', dossier: 'Transport' },
  { cle: 'feuille_de_route', libelle: 'Feuille de route', dossier: 'Transport' },
  { cle: 'releve_bancaire', libelle: 'Relevé bancaire', dossier: 'Banque' },
  { cle: 'contrat', libelle: 'Contrat', dossier: 'Juridique' },
  { cle: 'assurance', libelle: 'Assurance', dossier: 'Juridique' },
  { cle: 'document_vehicule', libelle: 'Document véhicule', dossier: 'Flotte' },
  { cle: 'document_salarie', libelle: 'Document salarié', dossier: 'Équipe' },
  { cle: 'courrier_administratif', libelle: 'Courrier administratif', dossier: 'Administratif' },
  { cle: 'photo', libelle: 'Photo', dossier: 'Autre' },
  { cle: 'autre', libelle: 'Autre', dossier: 'Autre' },
] as const

export const CLES_TYPE = TYPES_DOCUMENT.map(t => t.cle)

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

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** « Super U / Bernolsheim » → « Super-U-Bernolsheim » : lettres, chiffres, tirets ; 24 caractères au plus. */
export function lisible(s: string | null | undefined, max = 24): string {
  const propre = sansAccents(s ?? '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return propre.slice(0, max).replace(/-+$/, '')
}

export function extensionDe(nom: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(nom.trim())
  return m ? `.${m[1].toLowerCase()}` : ''
}

export function libelleType(cle: string | null | undefined): string {
  return TYPES_DOCUMENT.find(t => t.cle === cle)?.libelle ?? 'Autre'
}

export interface ElementsNom {
  date?: string | null
  type?: string | null
  tiers?: string | null
  montant_ttc_cts?: number | null
  reference?: string | null
}

/**
 * Nom rangé : `AAAA-MM-JJ_Type_Tiers_Reference_12,50EUR.ext` (éléments absents sautés ; « sans-date » si aucune date).
 * `pris` = noms déjà utilisés (minuscules) : on ajoute -2, -3… pour ne jamais en avoir deux identiques.
 */
export function nomPropose(e: ElementsNom, nomActuel: string, pris: ReadonlySet<string> = new Set()): string {
  const montant = e.montant_ttc_cts != null && e.montant_ttc_cts > 0 ? `${(e.montant_ttc_cts / 100).toFixed(2).replace('.', ',')}EUR` : ''
  const morceaux = [
    e.date || 'sans-date',
    lisible(libelleType(e.type), 20),
    lisible(e.tiers),
    lisible(e.reference, 16),
    montant,
  ].filter(Boolean)
  const ext = extensionDe(nomActuel)
  const base = morceaux.join('_')
  let nom = `${base}${ext}`
  for (let i = 2; pris.has(nom.toLowerCase()); i++) nom = `${base}-${i}${ext}`
  return nom
}
