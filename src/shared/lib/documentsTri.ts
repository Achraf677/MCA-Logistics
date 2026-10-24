// Tri des documents — MIROIR front de `supabase/functions/_shared/triDocuments.ts` (types, noms rangés). Un test compare les deux.

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
