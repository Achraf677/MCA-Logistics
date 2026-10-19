// Dépenses déclarées par un salarié ou un associé (lot S1) — PUR, testé.
// Une dépense = un justificatif photographié dans la boîte `receipts_inbox`, avec montant,
// catégorie, date et moyen de paiement : carte de la société, ou de sa poche (note de
// frais à rembourser). Le bureau la traite dans Finance › Charges.

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
  traite: 'Traitée',
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

/** Total à rembourser (notes de frais non refusées), en centimes. */
export function totalARembourser(depenses: Array<{ moyen_paiement: string | null; montant_ttc_cts: number | null; statut: string }>): number {
  return depenses
    .filter(d => d.moyen_paiement === 'personnel' && d.statut !== 'ignore')
    .reduce((s, d) => s + (d.montant_ttc_cts ?? 0), 0)
}
