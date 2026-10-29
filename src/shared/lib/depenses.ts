// Dépenses déclarées par un salarié ou un associé (lot S1) — PUR, testé.
// Une dépense = un justificatif photographié dans la boîte `receipts_inbox`, avec montant,
// catégorie, date et moyen de paiement : carte de la société, ou de sa poche (note de
// frais à rembourser). Le bureau la traite dans Finance › Justificatifs.

export type CategorieDepense = 'carburant' | 'peage' | 'parking' | 'repas' | 'entretien' | 'fournitures' | 'autre'
export type MoyenPaiement = 'carte_societe' | 'carte_carburant' | 'personnel'
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
  carte_carburant: 'Carte carburant',
  personnel: 'De ma poche (note de frais)',
}

/** Cartes de la société (une dépense « Carte de la société » dit laquelle). La valeur est stockée dans `receipts_inbox.carte`. */
export const CARTES_SOCIETE: Array<{ valeur: string; libelle: string }> = [
  { valeur: 'qonto_4103', libelle: 'QONTO : *4103' },
  { valeur: 'pennylane_4393', libelle: 'PENNYLANE : *4393' },
  { valeur: 'pennylane_5115', libelle: 'PENNYLANE : *5115' },
  { valeur: 'pennylane_8784', libelle: 'PENNYLANE : *8784' },
  { valeur: 'pennylane_8685', libelle: 'PENNYLANE : *8685' },
]

/** Cartes carburant (même principe, stocké dans `receipts_inbox.carte`). */
export const CARTES_CARBURANT: Array<{ valeur: string; libelle: string }> = [
  { valeur: 'edenred_9156', libelle: 'EDENRED : *9156' },
]

/** Cartes proposées pour un moyen de paiement ; vide = pas de carte à choisir. */
export function cartesDuMoyen(moyen: string | null | undefined): Array<{ valeur: string; libelle: string }> {
  if (moyen === 'carte_societe') return CARTES_SOCIETE
  if (moyen === 'carte_carburant') return CARTES_CARBURANT
  return []
}

export function libelleCarte(c: string | null | undefined): string {
  return [...CARTES_SOCIETE, ...CARTES_CARBURANT].find(x => x.valeur === c)?.libelle ?? ''
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
  /** Obligatoire quand le moyen est une carte (société ou carburant). */
  carte?: string
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
  if (cartesDuMoyen(s.moyen).length > 0 && !s.carte) m.push('Quelle carte ?')
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
 * Ce qui empêche de VALIDER une dépense côté bureau : tout est obligatoire (montant, date, catégorie, moyen de paiement,
 * fournisseur) — décision du 24/10/2026. Les anciens tickets incomplets se complètent un par un.
 */
export function manquesValidation(t: {
  montant_ttc_cts?: number | null; date_depense?: string | null; categorie?: string | null
  moyen_paiement?: string | null; carte?: string | null; supplier_id?: string | null
}): string[] {
  const m: string[] = []
  if (t.montant_ttc_cts == null || t.montant_ttc_cts <= 0) m.push('Montant')
  if (!t.date_depense) m.push('Date')
  if (!t.categorie) m.push('Catégorie')
  if (!t.moyen_paiement) m.push('Moyen de paiement')
  if (cartesDuMoyen(t.moyen_paiement).length > 0 && !t.carte) m.push('Carte')
  if (!t.supplier_id) m.push('Fournisseur')
  return m
}

/** Taux de TVA français que Pennylane accepte (même table que `_shared/lignesFacture#codeTvaLegal`). */
export const TAUX_TVA_JUSTIF = [20, 10, 5.5, 2.1, 0] as const

/** Noms lisibles des colonnes préremplies par la lecture IA du ticket. */
export const LIBELLE_CHAMP_LU: Record<string, string> = {
  montant_ttc_cts: 'montant', date_depense: 'date', categorie: 'catégorie', supplier_id: 'fournisseur',
}
