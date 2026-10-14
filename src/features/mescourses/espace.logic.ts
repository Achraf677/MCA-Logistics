// Espace salarié (Mes courses › Dépenses, Moi) — PUR, testé.
// Les règles métier partagées avec le bureau vivent dans `shared/lib/depenses.ts` ;
// ici, seulement ce qui sert à l'écran du salarié.
import { manquesDepense, montantSaisiEnCts, type CategorieDepense, type MoyenPaiement, type SaisieDepense } from '../../shared/lib/depenses'

// ── Onglets ─────────────────────────────────────────────────────────────────

export type OngletEspace = 'courses' | 'depenses' | 'moi'

export const ONGLETS_ESPACE: OngletEspace[] = ['courses', 'depenses', 'moi']

/** `?onglet=` → onglet connu ; tout le reste (absent, faux) → « courses ». */
export function lireOnglet(v: string | null | undefined): OngletEspace {
  return (ONGLETS_ESPACE as string[]).includes(v ?? '') ? (v as OngletEspace) : 'courses'
}

// ── Dates (AAAA-MM-JJ, calendrier local, sans fuseau) ───────────────────────

/** Nombre de jours entiers de `de` à `a` (AAAA-MM-JJ), négatif si `a` est passé. */
export function joursEntre(de: string, a: string): number {
  const t = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((t(a) - t(de)) / 86_400_000)
}

// ── Échéances (permis, visite médicale) ─────────────────────────────────────

export type NiveauEcheance = 'absente' | 'depassee' | 'bientot' | 'ok'

export interface EtatEcheance {
  niveau: NiveauEcheance
  /** Jours restants (négatif = dépassée) ; null si aucune date. */
  jours: number | null
  libelle: string
}

/** Alerte à 30 jours, comme les documents du bureau. */
export const SEUIL_ECHEANCE_JOURS = 30

export function etatEcheance(date: string | null | undefined, aujourdhui: string): EtatEcheance {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) {
    return { niveau: 'absente', jours: null, libelle: 'Date non renseignée, voir avec le bureau' }
  }
  const jours = joursEntre(aujourdhui, date.slice(0, 10))
  if (jours < 0) return { niveau: 'depassee', jours, libelle: `Dépassée depuis ${-jours} jour${-jours > 1 ? 's' : ''}` }
  if (jours === 0) return { niveau: 'bientot', jours, libelle: "Expire aujourd'hui" }
  if (jours < SEUIL_ECHEANCE_JOURS) return { niveau: 'bientot', jours, libelle: `Dans ${jours} jour${jours > 1 ? 's' : ''}` }
  return { niveau: 'ok', jours, libelle: 'À jour' }
}

// ── Dépenses ────────────────────────────────────────────────────────────────

export interface FormulaireDepense {
  montant: string
  categorie: CategorieDepense | ''
  moyen: MoyenPaiement | ''
  date: string
  note: string
}

export function formulaireDepenseVide(aujourdhui: string): FormulaireDepense {
  return { montant: '', categorie: '', moyen: '', date: aujourdhui, note: '' }
}

/** 1250 → « 12,50 » (pour pré-remplir la saisie). */
export function montantPourSaisie(cts: number | null | undefined): string {
  if (cts == null) return ''
  return (cts / 100).toFixed(2).replace('.', ',')
}

export function formulaireDepenseDepuis(
  d: { montant_ttc_cts?: number | null; categorie?: string | null; moyen_paiement?: string | null; date_depense?: string | null; note: string | null; created_at: string },
  aujourdhui: string,
): FormulaireDepense {
  return {
    montant: montantPourSaisie(d.montant_ttc_cts),
    categorie: (d.categorie ?? '') as CategorieDepense | '',
    moyen: (d.moyen_paiement ?? '') as MoyenPaiement | '',
    date: d.date_depense ?? (d.created_at ? d.created_at.slice(0, 10) : aujourdhui),
    note: d.note ?? '',
  }
}

export function saisieDepense(f: FormulaireDepense, aUnFichier: boolean): SaisieDepense {
  return { montant: f.montant, categorie: f.categorie, moyen: f.moyen, date: f.date, aUnFichier }
}

/** Manques d'une dépense, plus : pas de date dans le futur. */
export function manquesDepenseSalarie(f: FormulaireDepense, aUnFichier: boolean, aujourdhui: string): string[] {
  const m = manquesDepense(saisieDepense(f, aUnFichier))
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.date) && f.date > aujourdhui) m.push('La date ne peut pas être dans le futur')
  return m
}

/** Détails à écrire en base pour une dépense (montant vide = null). */
export function detailsDepense(f: FormulaireDepense) {
  const cts = montantSaisiEnCts(f.montant)
  return {
    montant_ttc_cts: cts == null || Number.isNaN(cts) ? null : cts,
    categorie: f.categorie || null,
    moyen_paiement: f.moyen || null,
    date_depense: f.date || null,
  }
}

/** Un fichier qu'on peut montrer en aperçu dans une balise <img>. */
export function estImage(mime: string | null | undefined): boolean {
  return (mime ?? '').startsWith('image/')
}
