import { formatMoney } from '../../shared/lib/money'
import type { CompteBanque, QontoTx, TxSide } from './tresorerie.types'

// Libellés FR des types d'opération Qonto (operation_type).
export const OPERATION_TYPE_LABELS: Record<string, string> = {
  card:         'Carte',
  transfer:     'Virement',
  income:       'Encaissement',
  direct_debit: 'Prélèvement',
  qonto_fee:    'Frais Qonto',
  cheque:       'Chèque',
  recall:       'Rappel',
  swift_income: 'Virement intl.',
}

export function operationTypeLabel(type: string | null): string {
  if (!type) return '—'
  return OPERATION_TYPE_LABELS[type] ?? type
}

// Classe Tailwind littérale (le scanner JIT ne voit pas les classes construites dynamiquement).
export function amountColorClass(side: TxSide): string {
  return side === 'credit' ? 'text-[var(--success)]' : 'text-[var(--danger)]'
}

// Montant signé : credit → « +x € », debit → « −x € ».
export function formatSignedAmount(tx: Pick<QontoTx, 'amount_cts' | 'side'>): string {
  const abs = formatMoney(Math.abs(tx.amount_cts))
  return tx.side === 'credit' ? `+${abs}` : `−${abs}`
}

export function formatSnapshotDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatTxDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR')
}

export type FiltreSens = 'tous' | 'entrees' | 'sorties'

/** Entrées / sorties (positifs) d'un lot de mouvements. */
export function totauxMouvements(txs: Array<Pick<QontoTx, 'amount_cts' | 'side'>>): { entreesCts: number; sortiesCts: number } {
  let entreesCts = 0, sortiesCts = 0
  for (const t of txs) {
    if (t.side === 'credit') entreesCts += Math.abs(t.amount_cts)
    else sortiesCts += Math.abs(t.amount_cts)
  }
  return { entreesCts, sortiesCts }
}

/** Recherche (libellé, type d'opération) et sens ; l'ordre d'entrée est gardé. */
export function filtrerMouvements(txs: QontoTx[], sens: FiltreSens, q: string): QontoTx[] {
  const mot = q.trim().toLowerCase()
  return txs.filter(t => {
    if (sens === 'entrees' && t.side !== 'credit') return false
    if (sens === 'sorties' && t.side !== 'debit') return false
    if (!mot) return true
    return `${t.label ?? ''} ${operationTypeLabel(t.operation_type)}`.toLowerCase().includes(mot)
  })
}

/** Solde Pennylane = somme des comptes, en ne gardant que la DERNIÈRE ligne de chaque compte (une synchro = une ligne ;
 *  `iban` porte « pennylane:<id du compte> », vide pour les anciennes lignes = un seul compte). */
export function soldePennylane(rows: Array<{ balance_cts: number; fetched_at: string; iban?: string | null }>): number | null {
  if (rows.length === 0) return null
  const dernier = new Map<string, { balance_cts: number; t: number }>()
  for (const r of rows) {
    const cle = r.iban ?? ''
    const t = new Date(r.fetched_at).getTime()
    const prev = dernier.get(cle)
    if (!prev || t > prev.t) dernier.set(cle, { balance_cts: r.balance_cts, t })
  }
  return [...dernier.values()].reduce((s, r) => s + r.balance_cts, 0)
}

// ── Relevé : vues, filtres, tri, export ───────────────────────────────────────

/** Vue de l'écran : un compte, ou les deux relevés fusionnés. */
export type VueCompte = CompteBanque | 'fusion'
export type FiltreJustif = 'tous' | 'sans' | 'avec'
export type TriReleve = 'date_desc' | 'date_asc' | 'montant_desc' | 'montant_asc'

export const LIBELLE_COMPTE: Record<CompteBanque, string> = { qonto: 'Qonto', swan: 'Swan' }

export interface FiltresReleve {
  vue: VueCompte
  sens: FiltreSens
  q: string
  /** Bornes de date (AAAA-MM-JJ, jour local), vides = pas de borne. */
  du: string
  au: string
  /** Bornes de montant en euros (valeur absolue), vides = pas de borne. */
  min: string
  max: string
  /** Type d'opération ('' = tous). */
  type: string
  justif: FiltreJustif
}

export const FILTRES_VIDES: FiltresReleve = {
  vue: 'qonto', sens: 'tous', q: '', du: '', au: '', min: '', max: '', type: '', justif: 'tous',
}

/** Jour local (AAAA-MM-JJ) d'un horodatage ; jamais toISOString().slice (veille avant 2 h). */
export function jourLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const j = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${j}`
}

/** Justificatif présent = rattaché à une dépense ou classé (frais bancaire, CCA…). */
export function aUnJustificatif(t: Pick<QontoTx, 'charge_id' | 'justif_type'>): boolean {
  return t.charge_id !== null || t.justif_type !== null
}

/** « 12,50 » ou « 12.5 » → centimes ; vide ou invalide → null. */
export function eurosEnCentimes(saisie: string): number | null {
  const n = Number(saisie.trim().replace(',', '.'))
  return saisie.trim() !== '' && Number.isFinite(n) ? Math.round(Math.abs(n) * 100) : null
}

/** Types d'opération présents dans un lot (pour la liste de filtre), triés par libellé. */
export function typesPresents(txs: Array<Pick<QontoTx, 'operation_type'>>): string[] {
  const set = new Set<string>()
  for (const t of txs) if (t.operation_type) set.add(t.operation_type)
  return [...set].sort((a, b) => operationTypeLabel(a).localeCompare(operationTypeLabel(b), 'fr'))
}

export function filtrerReleve(txs: QontoTx[], f: FiltresReleve): QontoTx[] {
  const mot = f.q.trim().toLowerCase()
  const min = eurosEnCentimes(f.min)
  const max = eurosEnCentimes(f.max)
  return txs.filter(t => {
    if (f.vue !== 'fusion' && t.source !== f.vue) return false
    if (f.sens === 'entrees' && t.side !== 'credit') return false
    if (f.sens === 'sorties' && t.side !== 'debit') return false
    const jour = jourLocal(t.settled_at)
    if (f.du && (!jour || jour < f.du)) return false
    if (f.au && (!jour || jour > f.au)) return false
    const abs = Math.abs(t.amount_cts)
    if (min !== null && abs < min) return false
    if (max !== null && abs > max) return false
    if (f.type && t.operation_type !== f.type) return false
    if (f.justif === 'sans' && aUnJustificatif(t)) return false
    if (f.justif === 'avec' && !aUnJustificatif(t)) return false
    if (!mot) return true
    const montant = (Math.abs(t.amount_cts) / 100).toFixed(2).replace('.', ',')
    return `${t.label ?? ''} ${operationTypeLabel(t.operation_type)} ${LIBELLE_COMPTE[t.source]} ${montant}`.toLowerCase().includes(mot)
  })
}

/** Nombre de filtres actifs (hors vue) : sert au bouton « Effacer ». */
export function nbFiltresActifs(f: FiltresReleve): number {
  return [f.sens !== 'tous', f.q.trim() !== '', f.du !== '', f.au !== '', f.min.trim() !== '', f.max.trim() !== '', f.type !== '', f.justif !== 'tous']
    .filter(Boolean).length
}

export function trierReleve(txs: QontoTx[], tri: TriReleve): QontoTx[] {
  const date = (t: QontoTx) => (t.settled_at ? new Date(t.settled_at).getTime() : 0)
  const copie = [...txs]
  switch (tri) {
    case 'date_asc': return copie.sort((a, b) => date(a) - date(b))
    case 'montant_desc': return copie.sort((a, b) => Math.abs(b.amount_cts) - Math.abs(a.amount_cts))
    case 'montant_asc': return copie.sort((a, b) => Math.abs(a.amount_cts) - Math.abs(b.amount_cts))
    default: return copie.sort((a, b) => date(b) - date(a))
  }
}

/**
 * Virements entre Qonto et Swan : une sortie d'un compte et une entrée du même montant sur l'autre,
 * à 4 jours ou moins. Chaque opération n'est jumelée qu'une fois. Ils gonflent entrées ET sorties.
 */
export function virementsInternes(txs: QontoTx[]): Set<string> {
  const JOUR = 86_400_000
  const out = new Set<string>()
  const date = (t: QontoTx) => (t.settled_at ? new Date(t.settled_at).getTime() : NaN)
  const entrees = txs.filter(t => t.side === 'credit' && !Number.isNaN(date(t)))
  for (const s of txs) {
    if (s.side !== 'debit' || Number.isNaN(date(s)) || out.has(s.id)) continue
    const jumeau = entrees.find(e =>
      !out.has(e.id) && e.source !== s.source && Math.abs(e.amount_cts) === Math.abs(s.amount_cts)
      && Math.abs(date(e) - date(s)) <= 4 * JOUR)
    if (jumeau) { out.add(s.id); out.add(jumeau.id) }
  }
  return out
}

/** Totaux d'une sélection ; les ids de `exclus` (virements internes) ne comptent pas. */
export function totauxSelection(txs: QontoTx[], exclus: Set<string> = new Set()): { entreesCts: number; sortiesCts: number; netCts: number } {
  const t = totauxMouvements(txs.filter(x => !exclus.has(x.id)))
  return { ...t, netCts: t.entreesCts - t.sortiesCts }
}

/** CSV du relevé affiché (séparateur « ; », montants signés en euros avec virgule). */
export function releveEnCsv(txs: QontoTx[], internes: Set<string> = new Set()): string {
  const echappe = (v: string) => `"${v.replace(/"/g, '""')}"`
  const lignes = [['Date', 'Compte', 'Libellé', 'Type', 'Montant (€)', 'Justificatif', 'Interne'].join(';')]
  for (const t of txs) {
    const signe = t.side === 'credit' ? 1 : -1
    lignes.push([
      jourLocal(t.settled_at),
      LIBELLE_COMPTE[t.source],
      echappe(t.label ?? ''),
      operationTypeLabel(t.operation_type),
      (signe * Math.abs(t.amount_cts) / 100).toFixed(2).replace('.', ','),
      aUnJustificatif(t) ? 'oui' : 'non',
      internes.has(t.id) ? 'oui' : '',
    ].join(';'))
  }
  return lignes.join('\n')
}

/** Infos utiles de la fiche brute d'une opération (Qonto ou Pennylane) ; ne garde que du texte lisible. */
export function detailBrut(raw: unknown): Array<{ libelle: string; valeur: string }> {
  if (!raw || typeof raw !== 'object') return []
  const r = raw as Record<string, unknown>
  const champs: Array<[string, string]> = [
    ['counterparty_name', 'Contrepartie'], ['reference', 'Référence'], ['note', 'Note'],
    ['status', 'Statut'], ['emitted_at', 'Émise le'], ['date', 'Date'], ['currency', 'Devise'],
  ]
  const out: Array<{ libelle: string; valeur: string }> = []
  for (const [cle, libelle] of champs) {
    const v = r[cle]
    if (typeof v === 'string' && v.trim() !== '') out.push({ libelle, valeur: v })
  }
  return out
}

/** Montants des phrases de résumé : « +x € » / « −x € », mais « 0,00 € » (jamais « −0,00 € ») quand c'est zéro. */
export function formatEntrees(cts: number): string {
  return cts === 0 ? formatMoney(0) : `+${formatMoney(cts)}`
}
export function formatSorties(cts: number): string {
  return cts === 0 ? formatMoney(0) : `−${formatMoney(cts)}`
}

/** Le détail « sans justificatif » n'a pas de sens pour une entrée ni pour un virement entre ses propres comptes. */
export function manqueUnJustificatif(t: Pick<QontoTx, 'charge_id' | 'justif_type' | 'side' | 'id'>, internes: Set<string>): boolean {
  return t.side === 'debit' && !aUnJustificatif(t) && !internes.has(t.id)
}
