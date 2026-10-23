// Dépenses déclarées par un salarié ou un associé (lot S1) — PUR, testé.
// Une dépense = un justificatif photographié dans la boîte `receipts_inbox`, avec montant,
// catégorie, date et moyen de paiement : carte de la société, ou de sa poche (note de
// frais à rembourser). Le bureau la traite dans Finance › Justificatifs.

export type CategorieDepense = 'carburant' | 'peage' | 'parking' | 'repas' | 'entretien' | 'fournitures' | 'autre'
export type MoyenPaiement = 'carte_societe' | 'personnel'
export type StatutDepense = 'a_traiter' | 'traite' | 'ignore'

export const CATEGORIES_DEPENSE: Array<{ valeur: CategorieDepense; libelle: string }> = [
  { valeur: 'carburant', libelle: 'Carburant' },
  { valeur: 'peage', libelle: 'Péage' },
  { valeur: 'parking', libelle: 'Parking' },
  { valeur: 'repas', libelle: 'Repas' },
  { valeur: 'entretien', libelle: 'Entretien / lavage' },
  { valeur: 'fournitures', libelle: 'Fournitures' },
  { valeur: 'autre', libelle: 'Autre' },
]

export const LIBELLE_MOYEN: Record<MoyenPaiement, string> = {
  carte_societe: 'Carte de la société',
  personnel: 'De ma poche (note de frais)',
}

export const LIBELLE_STATUT_DEPENSE: Record<StatutDepense, string> = {
  a_traiter: 'En attente du bureau',
  traite: 'Validée',
  ignore: 'Refusée',
}

export function libelleCategorie(c: string | null | undefined): string {
  return CATEGORIES_DEPENSE.find(x => x.valeur === c)?.libelle ?? 'Non précisée'
}

/** « 12,50 » / « 12.5 » / « 12 » → centimes ; '' → null ; invalide → NaN. */
export function montantSaisiEnCts(v: string): number | null {
  const t = v.trim().replace(/\s/g, '').replace(',', '.')
  if (!t) return null
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return Number.NaN
  return Math.round(Number(t) * 100)
}

export interface SaisieDepense {
  montant: string
  categorie: CategorieDepense | ''
  moyen: MoyenPaiement | ''
  date: string
  /** Obligatoire : dit au bureau à quoi sert la dépense (la catégorie, c'est lui qui la choisit). */
  note: string
  aUnFichier: boolean
}

/** Ce qui empêche d'envoyer. Note de frais : montant obligatoire (il faut rembourser). */
export function manquesDepense(s: SaisieDepense): string[] {
  const m: string[] = []
  if (!s.aUnFichier) m.push('Photo du justificatif')
  const cts = montantSaisiEnCts(s.montant)
  if (Number.isNaN(cts)) m.push('Montant invalide (ex. 12,50)')
  else if (s.moyen === 'personnel' && cts == null) m.push('Montant (note de frais)')
  if (!s.moyen) m.push('Payé avec quoi ?')
  if (!s.note.trim()) m.push('Note')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) m.push('Date de la dépense')
  return m
}

type DepenseRemb = { moyen_paiement: string | null; montant_ttc_cts: number | null; statut: string; rembourse_le?: string | null }

/** Note de frais encore due : payée de la poche, ni refusée ni déjà remboursée. */
export function estADeduireRemboursement(d: DepenseRemb): boolean {
  return d.moyen_paiement === 'personnel' && d.statut !== 'ignore' && !d.rembourse_le
}

/** Total à rembourser (notes de frais non refusées, pas encore remboursées), en centimes. */
export function totalARembourser(depenses: DepenseRemb[]): number {
  return depenses.filter(estADeduireRemboursement).reduce((s, d) => s + (d.montant_ttc_cts ?? 0), 0)
}

/**
 * Ce qui empêche de VALIDER une dépense côté bureau : sans montant elle ne peut ni devenir une charge,
 * ni être remboursée. (Les anciens tickets sans montant se corrigent un par un.)
 */
export function manquesValidation(t: { montant_ttc_cts?: number | null; date_depense?: string | null }): string[] {
  const m: string[] = []
  if (t.montant_ttc_cts == null || t.montant_ttc_cts <= 0) m.push('Montant')
  return m
}

/** Taux de TVA français que Pennylane accepte (même table que `_shared/lignesFacture#codeTvaLegal`). */
export const TAUX_TVA_JUSTIF = [20, 10, 5.5, 2.1, 0] as const

/** Noms lisibles des colonnes préremplies par la lecture IA du ticket. */
export const LIBELLE_CHAMP_LU: Record<string, string> = {
  montant_ttc_cts: 'montant', date_depense: 'date', categorie: 'catégorie', tva_rate: 'TVA', supplier_id: 'fournisseur',
}
