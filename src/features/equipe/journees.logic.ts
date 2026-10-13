// Équipe › journées de colis, côté bureau (lots S1-S2, plan mca-spec/PLAN-ESPACE-SALARIE.md § 0).
// PUR, testé. Les règles partagées avec le salarié vivent dans shared/lib/journeesColis.ts ;
// ici : ce que seul l'écran du bureau calcule (écarts, filtres, garde de suppression,
// historique lisible, vue par jour, saisie des tarifs).
import { colisRetenus, type JourneeColis, type HistoriqueJournee, type LigneRapport } from '../../shared/lib/journeesColis'
import { montantSaisiEnCts } from '../../shared/lib/depenses'

export interface NombresColis { domicile: number; relais: number; litige: number }

export const LIBELLE_CHAMP: Record<keyof NombresColis, string> = {
  domicile: 'Colis domicile',
  relais: 'Colis point relais',
  litige: 'Colis en litige',
}

/** Nombres déclarés par le salarié. */
export function declares(j: Pick<JourneeColis, 'colis_domicile' | 'colis_relais' | 'colis_litige'>): NombresColis {
  return { domicile: j.colis_domicile, relais: j.colis_relais, litige: j.colis_litige }
}

export interface Ecart { champ: keyof NombresColis; avant: number; apres: number }

/** Écarts entre deux jeux de nombres (déclaré → validé, ou validé → corrigé). */
export function ecarts(avant: NombresColis, apres: NombresColis): Ecart[] {
  return (['domicile', 'relais', 'litige'] as const)
    .filter(c => avant[c] !== apres[c])
    .map(c => ({ champ: c, avant: avant[c], apres: apres[c] }))
}

/** Saisie « validé » d'une carte : nombre entier ≥ 0, sinon null (invalide). Vide = invalide. */
export function nombreSaisi(v: string): number | null {
  const t = v.trim()
  if (!/^\d{1,6}$/.test(t)) return null
  return Number(t)
}

/** Lit les trois champs saisis ; null si l'un est invalide. */
export function nombresSaisis(s: { domicile: string; relais: string; litige: string }): NombresColis | null {
  const d = nombreSaisi(s.domicile), r = nombreSaisi(s.relais), l = nombreSaisi(s.litige)
  return d == null || r == null || l == null ? null : { domicile: d, relais: r, litige: l }
}

/** Champs texte pré-remplis avec des nombres. */
export function versSaisie(n: NombresColis): { domicile: string; relais: string; litige: string } {
  return { domicile: String(n.domicile), relais: String(n.relais), litige: String(n.litige) }
}

/** Ancienneté lisible d'un envoi (« à l'instant », « il y a 3 h », « il y a 2 j »). */
export function anciennete(iso: string | null | undefined, maintenant: Date): string {
  if (!iso) return 'date d’envoi inconnue'
  const ms = maintenant.getTime() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return 'date d’envoi inconnue'
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'à l’instant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.floor(h / 24)
  return `il y a ${j} j`
}

/** Envoi en attente depuis plus de 48 h : signalé sur la carte. */
export function envoiAncien(iso: string | null | undefined, maintenant: Date): boolean {
  if (!iso) return false
  return maintenant.getTime() - new Date(iso).getTime() > 48 * 3600 * 1000
}

export interface FiltresJournees {
  memberId?: string
  clientId?: string
  statut?: JourneeColis['statut'] | ''
}

export function filtrerJournees(js: JourneeColis[], f: FiltresJournees): JourneeColis[] {
  return js.filter(j =>
    (!f.memberId || j.member_id === f.memberId)
    && (!f.clientId || j.client_id === f.clientId)
    && (!f.statut || j.statut === f.statut))
}

/** Options distinctes (id → nom) tirées des journées, triées par nom. */
export function optionsDistinctes(js: JourneeColis[], cle: 'member' | 'client'): Array<{ id: string; nom: string }> {
  const m = new Map<string, string>()
  for (const j of js) {
    if (cle === 'member') m.set(j.member_id, j.team_members?.full_name ?? 'Salarié inconnu')
    else m.set(j.client_id, j.clients?.name ?? 'Client inconnu')
  }
  return [...m].map(([id, nom]) => ({ id, nom })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
}

// ── Suppression « compliquée » ───────────────────────────────────────────────

function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Deuxième garde de la suppression : la personne retape le nom du salarié OU la date de la
 * journée (JJ/MM/AAAA ou AAAA-MM-JJ). Accents, casse et espaces ignorés.
 */
export function confirmationRetapee(saisie: string, nomSalarie: string, dateIso: string): boolean {
  const s = normaliser(saisie)
  if (!s) return false
  if (nomSalarie && s === normaliser(nomSalarie)) return true
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso)
  if (!m) return false
  const fr = `${m[3]}/${m[2]}/${m[1]}`
  return s === dateIso || s === fr
}

/** Motif utilisable (au moins 5 caractères utiles). */
export function motifValide(m: string): boolean {
  return m.trim().length >= 5
}

// ── Historique lisible ───────────────────────────────────────────────────────

const CHAMPS_SUIVIS: Array<{ cle: keyof JourneeColis; libelle: string }> = [
  { cle: 'statut', libelle: 'Statut' },
  { cle: 'colis_domicile', libelle: 'Domicile déclaré' },
  { cle: 'colis_relais', libelle: 'Relais déclaré' },
  { cle: 'colis_litige', libelle: 'Litiges déclarés' },
  { cle: 'domicile_valide', libelle: 'Domicile validé' },
  { cle: 'relais_valide', libelle: 'Relais validé' },
  { cle: 'litige_valide', libelle: 'Litiges validés' },
  { cle: 'litige_raison', libelle: 'Raison du litige' },
  { cle: 'client_id', libelle: 'Client' },
  { cle: 'date', libelle: 'Date' },
]

export interface Changement { libelle: string; avant: string; apres: string }

function texte(v: unknown): string {
  if (v == null || v === '') return '—'
  return String(v)
}

/** Ce qui a changé dans une ligne d'historique (champs suivis seulement). */
export function changementsHistorique(h: Pick<HistoriqueJournee, 'avant' | 'apres'>,
  libelleStatut: (s: string) => string = s => s): Changement[] {
  if (!h.avant || !h.apres) return []
  const out: Changement[] = []
  for (const { cle, libelle } of CHAMPS_SUIVIS) {
    const a = (h.avant as Record<string, unknown>)[cle]
    const b = (h.apres as Record<string, unknown>)[cle]
    if (a === b || (a == null && b == null)) continue
    const f = cle === 'statut' ? (v: unknown) => (v == null ? '—' : libelleStatut(String(v))) : texte
    out.push({ libelle, avant: f(a), apres: f(b) })
  }
  return out
}

// ── Vue par jour (rapports) ──────────────────────────────────────────────────

export interface LigneJour {
  date: string
  journees: number
  domicile: number
  relais: number
  litige: number
  /** Journées pas encore validées (envoyées ou à corriger) ce jour-là. */
  nonValidees: number
}

/** Une ligne par date (brouillons exclus), nombres retenus (validés si validée), date croissante. */
export function rapportParJour(js: JourneeColis[]): LigneJour[] {
  const m = new Map<string, LigneJour>()
  for (const j of js) {
    if (j.statut === 'brouillon') continue
    const l = m.get(j.date) ?? { date: j.date, journees: 0, domicile: 0, relais: 0, litige: 0, nonValidees: 0 }
    const r = colisRetenus(j)
    l.journees += 1; l.domicile += r.domicile; l.relais += r.relais; l.litige += r.litige
    if (j.statut !== 'validee') l.nonValidees += 1
    m.set(j.date, l)
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Nom du fichier d'export : `rapport-colis-AAAA-MM.csv` (ou `-AAAA-MM-JJ` pour un jour). */
export function nomFichierRapport(periode: string): string {
  return `rapport-colis-${periode}.csv`
}

/** Bornes d'une période : un jour (AAAA-MM-JJ) ou un mois (AAAA-MM). */
export function bornesPeriode(mode: 'jour' | 'mois', valeur: string): { du: string; au: string } | null {
  if (mode === 'jour') return /^\d{4}-\d{2}-\d{2}$/.test(valeur) ? { du: valeur, au: valeur } : null
  if (!/^\d{4}-\d{2}$/.test(valeur)) return null
  const [a, mo] = valeur.split('-').map(Number)
  if (mo < 1 || mo > 12) return null
  const fin = new Date(a, mo, 0).getDate()
  return { du: `${valeur}-01`, au: `${valeur}-${String(fin).padStart(2, '0')}` }
}

/** Libellé français d'une période (« octobre 2026 », « 12/10/2026 »). */
export function libellePeriode(mode: 'jour' | 'mois', valeur: string): string {
  if (mode === 'jour') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : valeur
  }
  const m = /^(\d{4})-(\d{2})$/.exec(valeur)
  if (!m) return valeur
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
    'septembre', 'octobre', 'novembre', 'décembre'][Number(m[2]) - 1]
  return mois ? `${mois} ${m[1]}` : valeur
}

// ── Fiche Équipe : tarifs au colis ───────────────────────────────────────────

/** Tarif saisi en euros → centimes. Vide = null (pas de tarif). Illisible = 'invalide'. */
export function tarifSaisiCts(v: string): number | null | 'invalide' {
  const c = montantSaisiEnCts(v)
  if (c == null) return null
  return Number.isNaN(c) ? 'invalide' : c
}

/** Centimes → texte à éditer (« 1,20 »), vide si null. */
export function tarifEnTexte(cts: number | null | undefined): string {
  return cts == null ? '' : (cts / 100).toFixed(2).replace('.', ',')
}

// ── Total général du rapport ─────────────────────────────────────────────────

export interface TotalRapport {
  domicile: number
  relais: number
  litige: number
  enAttente: number
  aCorriger: number
  /** Somme des montants connus (centimes). */
  du_cts: number
  /** Salariés dont le montant n'a pas pu être calculé (tarif manquant). */
  tarifsManquants: string[]
}

/** Total général (sur le validé) des lignes par salarié. */
export function totalRapport(lignes: LigneRapport[]): TotalRapport {
  const t: TotalRapport = { domicile: 0, relais: 0, litige: 0, enAttente: 0, aCorriger: 0, du_cts: 0, tarifsManquants: [] }
  for (const l of lignes) {
    t.domicile += l.totaux.valides.domicile
    t.relais += l.totaux.valides.relais
    t.litige += l.totaux.valides.litige
    t.enAttente += l.totaux.enAttente
    t.aCorriger += l.totaux.aCorriger
    if (l.du_cts == null) t.tarifsManquants.push(l.nom)
    else t.du_cts += l.du_cts
  }
  return t
}
