// Espace salarié (Mes courses › Ma tournée, Ma journée, Dépenses, Moi) — PUR, testé.
// Les règles métier partagées avec le bureau vivent dans `shared/lib/journeesColis.ts` et
// `shared/lib/depenses.ts` ; ici, seulement ce qui sert à l'écran du salarié.
import { colisRetenus, nombreColis, remunerationCts, type JourneeColis, type SaisieJournee, type TotauxColis } from '../../shared/lib/journeesColis'
import { manquesDepense, montantSaisiEnCts, type CategorieDepense, type MoyenPaiement, type SaisieDepense } from '../../shared/lib/depenses'

// ── Onglets ─────────────────────────────────────────────────────────────────

export type OngletEspace = 'courses' | 'tournee' | 'depenses' | 'moi'

export const ONGLETS_ESPACE: OngletEspace[] = ['courses', 'tournee', 'depenses', 'moi']

/** `?onglet=` → onglet connu ; tout le reste (absent, faux) → « courses ». */
export function lireOnglet(v: string | null | undefined): OngletEspace {
  return (ONGLETS_ESPACE as string[]).includes(v ?? '') ? (v as OngletEspace) : 'courses'
}

// ── Dates (AAAA-MM-JJ, calendrier local, sans fuseau) ───────────────────────

/** Décale une date AAAA-MM-JJ de `delta` jours. */
export function decalerJour(date: string, delta: number): string {
  const [a, m, j] = date.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1, j + delta))
  return d.toISOString().slice(0, 10)
}

/** Une journée ne se déclare pas à l'avance : jamais après aujourd'hui. */
export function borneAujourdhui(date: string, aujourdhui: string): string {
  return date > aujourdhui ? aujourdhui : date
}

/** Mois « AAAA-MM » d'une date, décalé de `delta` mois. */
export function decalerMois(mois: string, delta: number): string {
  const [a, m] = mois.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

/** « 2026-10 » → « octobre 2026 ». */
export function libelleMois(mois: string): string {
  const [a, m] = mois.split('-').map(Number)
  if (!a || !m) return mois
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(a, m - 1, 1)))
}

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

// ── Saisie d'une journée ────────────────────────────────────────────────────

/** Ce que tape le salarié : des chaînes, pour accepter le champ vide pendant la saisie. */
export interface FormulaireJournee {
  domicile: string
  relais: string
  litige: string
  raison: string
  note: string
}

export const FORMULAIRE_VIDE: FormulaireJournee = { domicile: '', relais: '', litige: '', raison: '', note: '' }

export function formulaireDepuis(j: JourneeColis | null | undefined): FormulaireJournee {
  if (!j) return { ...FORMULAIRE_VIDE }
  const n = (v: number) => (v ? String(v) : '')
  return {
    domicile: n(j.colis_domicile), relais: n(j.colis_relais), litige: n(j.colis_litige),
    raison: j.litige_raison ?? '', note: j.note ?? '',
  }
}

/** Formulaire → saisie typée ; `invalides` liste les champs non entiers. */
export function lireFormulaire(f: FormulaireJournee): { saisie: SaisieJournee; invalides: string[] } {
  const invalides: string[] = []
  const lire = (v: string, libelle: string) => {
    const n = nombreColis(v)
    if (n == null) { invalides.push(libelle); return 0 }
    return n
  }
  return {
    saisie: {
      colis_domicile: lire(f.domicile, 'Colis à domicile : nombre invalide'),
      colis_relais: lire(f.relais, 'Colis en point relais : nombre invalide'),
      colis_litige: lire(f.litige, 'Colis en litige : nombre invalide'),
      litige_raison: f.raison,
    },
    invalides,
  }
}

/** − / + sur un compteur : jamais sous 0, un champ illisible repart de 0. */
export function pas(v: string, delta: number): string {
  const n = nombreColis(v) ?? 0
  const r = Math.max(0, n + delta)
  return r === 0 ? '' : String(r)
}

/** Le formulaire a-t-il changé par rapport à la journée enregistrée ? */
export function formulaireModifie(f: FormulaireJournee, j: JourneeColis | null | undefined): boolean {
  const ref = formulaireDepuis(j)
  const norm = (x: FormulaireJournee) => {
    const { saisie } = lireFormulaire(x)
    return [saisie.colis_domicile, saisie.colis_relais, saisie.colis_litige, x.raison.trim(), x.note.trim()].join('|')
  }
  return norm(f) !== norm(ref)
}

/** Lignes « Corrigé par le bureau : 120 → 118 » d'une journée validée. */
export function lignesCorrection(j: JourneeColis): string[] {
  if (j.statut !== 'validee') return []
  const r = colisRetenus(j)
  const out: string[] = []
  if (r.domicile !== j.colis_domicile) out.push(`À domicile : ${j.colis_domicile} → ${r.domicile}`)
  if (r.relais !== j.colis_relais) out.push(`En point relais : ${j.colis_relais} → ${r.relais}`)
  if (r.litige !== j.colis_litige) out.push(`En litige : ${j.colis_litige} → ${r.litige}`)
  return out
}

// ── Mon mois ────────────────────────────────────────────────────────────────

export interface JourDuMois {
  date: string
  journees: JourneeColis[]
  domicile: number
  relais: number
  litige: number
}

/** Journées du mois regroupées par date, plus récentes d'abord. */
export function joursDuMois(journees: JourneeColis[]): JourDuMois[] {
  const par = new Map<string, JourDuMois>()
  for (const j of journees) {
    const jour = par.get(j.date) ?? { date: j.date, journees: [], domicile: 0, relais: 0, litige: 0 }
    const r = colisRetenus(j)
    jour.journees.push(j)
    jour.domicile += r.domicile; jour.relais += r.relais; jour.litige += r.litige
    par.set(j.date, jour)
  }
  return [...par.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/** Déclaré mais pas encore validé (envoyé ou à corriger), brouillons exclus. */
export function colisEnAttente(t: TotauxColis): { domicile: number; relais: number; litige: number } {
  return {
    domicile: t.domicile - t.valides.domicile,
    relais: t.relais - t.valides.relais,
    litige: t.litige - t.valides.litige,
  }
}

export interface EstimationPaie {
  /** null = un tarif manque pour des colis validés. */
  cts: number | null
  rien: boolean
}

/** Estimation de la paie au colis, sur le VALIDÉ seulement. */
export function estimationPaie(
  t: TotauxColis,
  tarifs: { tarif_domicile_cts: number | null; tarif_relais_cts: number | null },
): EstimationPaie {
  const rien = t.valides.domicile + t.valides.relais === 0
  return { cts: remunerationCts(t.valides, tarifs), rien }
}

// ── Dépenses ────────────────────────────────────────────────────────────────

export interface FormulaireDepense {
  montant: string
  categorie: CategorieDepense | ''
  moyen: MoyenPaiement | ''
  /** Carte de la société choisie (si moyen = carte_societe). */
  carte: string
  /** Véhicule du plein (carte carburant). */
  vehicule: string
  date: string
  note: string
}

export function formulaireDepenseVide(aujourdhui: string): FormulaireDepense {
  return { montant: '', categorie: '', moyen: '', carte: '', vehicule: '', date: aujourdhui, note: '' }
}

/** 1250 → « 12,50 » (pour pré-remplir la saisie). */
export function montantPourSaisie(cts: number | null | undefined): string {
  if (cts == null) return ''
  return (cts / 100).toFixed(2).replace('.', ',')
}

export function formulaireDepenseDepuis(
  d: { montant_ttc_cts?: number | null; categorie?: string | null; moyen_paiement?: string | null; carte?: string | null; vehicle_id?: string | null; date_depense?: string | null; note: string | null; created_at: string },
  aujourdhui: string,
): FormulaireDepense {
  return {
    montant: montantPourSaisie(d.montant_ttc_cts),
    categorie: (d.categorie ?? '') as CategorieDepense | '',
    moyen: (d.moyen_paiement ?? '') as MoyenPaiement | '',
    carte: d.carte ?? '',
    vehicule: d.vehicle_id ?? '',
    date: d.date_depense ?? (d.created_at ? d.created_at.slice(0, 10) : aujourdhui),
    note: d.note ?? '',
  }
}

export function saisieDepense(f: FormulaireDepense, aUnFichier: boolean): SaisieDepense {
  return { montant: f.montant, categorie: f.categorie, moyen: f.moyen, carte: f.carte, vehicule: f.vehicule, date: f.date, note: f.note, aUnFichier }
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
    // Carte carburant : la catégorie est connue d'avance, le salarié n'a rien à choisir.
    categorie: f.moyen === 'carte_carburant' ? 'carburant' : (f.categorie || null),
    moyen_paiement: f.moyen || null,
    carte: f.moyen === 'carte_societe' || f.moyen === 'carte_carburant' ? (f.carte || null) : null,
    vehicle_id: f.moyen === 'carte_carburant' ? (f.vehicule || null) : null,
    date_depense: f.date || null,
  }
}

/** Un fichier qu'on peut montrer en aperçu dans une balise <img>. */
export function estImage(mime: string | null | undefined): boolean {
  return (mime ?? '').startsWith('image/')
}
