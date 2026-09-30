import { addTva, deliveryTotalHtCts, deliveryTotalTtcCts } from '../../shared/lib/money'
import type { DeliveryRow } from './livraisons.types'

// Réexports pour conserver les imports existants (Livraisons.tsx,
// DrawerLivraison.tsx, tests…). Les helpers vivent désormais dans
// shared/lib/money — même clamp, même comportement — pour être consommables
// depuis d'autres features (TVA, encaissement, relances, assistant) sans
// enfreindre la règle « aucun import entre features/ ».
export {
  effectiveHtCts,
  effectiveTtcCts,
  formatCents,
  extraLinesHtCts,
  extraLinesTvaCts,
  extraLinesTtcCts,
  deliveryTotalHtCts,
  deliveryTotalTtcCts,
} from '../../shared/lib/money'

// ── Machine à états ──────────────────────────────────────────────────────────
// Déplacée dans shared/lib/livraisonStatuts.ts : l'écran chauffeur « Mes
// courses » en a besoin aussi, et une feature ne peut pas en importer une
// autre. Ré-exportée ici pour ne casser aucun import existant.
export { TRANSITIONS, canTransition, allowedNextStatuses } from '../../shared/lib/livraisonStatuts'

// ── Labels & couleurs ────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<string, string> = {
  planifiee: 'Planifiée',
  en_cours:  'En cours',
  livree:    'Livrée',
  facturee:  'Facturée',
  payee:     'Payée',
  annulee:   'Annulée',
  // Rétro-compat (données legacy)
  brouillon: 'Brouillon',
  validee:   'Validée',
}

export const STATUS_COLORS: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'danger' | 'purple'> = {
  planifiee: 'muted',
  en_cours:  'info',
  // livree = à facturer (action attendue) ; facturee = en attente du paiement :
  // deux couleurs distinctes, sinon on ne voit pas ce qui reste à faire.
  livree:    'warning',
  facturee:  'purple',
  payee:     'success',
  annulee:   'danger',
  brouillon: 'muted',
  validee:   'info',
}

export const TRANSITION_ACTION_LABELS: Record<string, Record<string, string>> = {
  planifiee: { en_cours: 'Démarrer', livree: 'Marquer livrée', annulee: 'Annuler la livraison' },
  en_cours:  { livree: 'Marquer livrée', annulee: 'Annuler la livraison' },
  livree:    { facturee: 'Facturer' },
  facturee:  { payee: 'Encaisser' },
}

// Aligne sur clients.type : meme liste des deux cotes (migration 20260911070000).
export const TYPE_LABELS: Record<string, string> = {
  particulier:  'Particulier',
  professionnel:'Professionnel',
}

export const TYPE_COLORS: Record<string, 'info' | 'success' | 'warning' | 'muted' | 'purple'> = {
  particulier:  'muted',
  professionnel:'purple',
}

// ── Calcul du montant ────────────────────────────────────────────────────────

/** Interface minimale du client nécessaire au calcul (pas d'import cross-feature) */
export interface ClientTariff {
  tariff_mode: 'forfait' | 'km' | 'palette' | 'manuel'
  tariff_rate_cts: number | null
}

export interface AmountParams {
  distance_km?: number | null
  pallets?: number | null
  manual_ht_cts?: number | null
  /** TVA manuelle en centimes. Si fournie, surcharge le calcul automatique à tvaRate. */
  manual_tva_cts?: number | null
}

export interface ComputedAmount {
  amount_ht_cts: number
  tva_cts: number
  amount_ttc_cts: number
}

/**
 * Calcule HT/TVA/TTC depuis le tarif client.
 *
 * Deux modes TVA — invariant ht + tva === ttc toujours garanti :
 *   • TVA manuelle (params.manual_tva_cts != null) :
 *       tva_cts = manual_tva_cts ; ttc = ht + tva
 *   • TVA automatique (défaut 20 %) :
 *       ttc = addTva(ht, tvaRate) puis tva = ttc − ht  (différence, jamais ht*rate)
 */
export function computeAmount(
  client: ClientTariff,
  params: AmountParams,
  tvaRate = 0.20,
): ComputedAmount | null {
  let amount_ht_cts: number

  switch (client.tariff_mode) {
    case 'forfait':
      if (client.tariff_rate_cts == null) return null
      amount_ht_cts = client.tariff_rate_cts
      break
    case 'km':
      if (client.tariff_rate_cts == null || params.distance_km == null) return null
      amount_ht_cts = Math.round(client.tariff_rate_cts * params.distance_km)
      break
    case 'palette':
      if (client.tariff_rate_cts == null || params.pallets == null) return null
      amount_ht_cts = Math.round(client.tariff_rate_cts * params.pallets)
      break
    case 'manuel':
      if (params.manual_ht_cts == null) return null
      amount_ht_cts = params.manual_ht_cts
      break
    default:
      return null
  }

  if (params.manual_tva_cts != null) {
    // TVA surchargée par l'utilisateur — ttc = ht + tva (ht+tva===ttc garanti)
    const tva_cts = params.manual_tva_cts
    const amount_ttc_cts = amount_ht_cts + tva_cts
    return { amount_ht_cts, tva_cts, amount_ttc_cts }
  }

  // TVA automatique par différence — addTva arrondit le TTC, tva = ttc − ht
  const amount_ttc_cts = addTva(amount_ht_cts, tvaRate)
  const tva_cts = amount_ttc_cts - amount_ht_cts
  return { amount_ht_cts, tva_cts, amount_ttc_cts }
}

// ── Période affichée (dates LOCALES) ─────────────────────────────────────────
// Jamais `toISOString()` pour une date du jour : à minuit heure de Paris, c'est
// encore la veille en UTC — le « 1er du mois » devenait le dernier jour du mois
// précédent.

/** Date locale 'AAAA-MM-JJ' (sans passer par UTC). */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type RaccourciPeriode = 'jour' | 'semaine' | 'mois' | 'tout'

/** Bornes incluses 'AAAA-MM-JJ' ; absente = pas de borne de ce côté. */
export interface Periode { debut?: string; fin?: string }

/**
 * Bornes d'un raccourci de période, en dates locales, bornes INCLUSES.
 * Semaine = lundi → dimanche (usage français). Mois = du 1er au dernier jour.
 */
export function bornesPeriode(r: RaccourciPeriode, ref: Date): Periode {
  const a = ref.getFullYear(), m = ref.getMonth(), j = ref.getDate()
  switch (r) {
    case 'jour':
      return { debut: isoLocal(ref), fin: isoLocal(ref) }
    case 'semaine': {
      const lundi = j - ((ref.getDay() + 6) % 7)
      return { debut: isoLocal(new Date(a, m, lundi)), fin: isoLocal(new Date(a, m, lundi + 6)) }
    }
    case 'mois':
      return { debut: isoLocal(new Date(a, m, 1)), fin: isoLocal(new Date(a, m + 1, 0)) }
    case 'tout':
      return {}
  }
}

/** Une date 'AAAA-MM-JJ' est-elle dans la période (bornes incluses) ? */
export function dansPeriode(date: string, p: Periode): boolean {
  const d = date.slice(0, 10)
  return (!p.debut || d >= p.debut) && (!p.fin || d <= p.fin)
}

/** « 01/09 → 30/09/2026 », « 30/09/2026 », « Tout l'historique ». */
export function libellePeriode(p: Periode): string {
  const f = (iso: string) => { const [a, m, j] = iso.split('-'); return `${j}/${m}/${a}` }
  if (!p.debut && !p.fin) return "Tout l'historique"
  if (p.debut && p.fin) {
    if (p.debut === p.fin) return f(p.debut)
    return p.debut.slice(0, 4) === p.fin.slice(0, 4)
      ? `${f(p.debut).slice(0, 5)} → ${f(p.fin)}`
      : `${f(p.debut)} → ${f(p.fin)}`
  }
  return p.debut ? `Depuis le ${f(p.debut)}` : `Jusqu'au ${f(p.fin as string)}`
}

// ── KPIs de la période ───────────────────────────────────────────────────────

/** Échéance = date de facture + délai du client (jours), en date locale. */
export function echeanceFacture(invoicedAt: string, delaiJours: number): string {
  const [a, m, j] = invoicedAt.slice(0, 10).split('-').map(Number)
  return isoLocal(new Date(a, m - 1, j + delaiJours))
}

/** Délai appliqué quand le client n'en a pas (même règle que le Dashboard). */
export const DELAI_PAIEMENT_DEFAUT = 30

const OUVERTES = new Set(['planifiee', 'en_cours'])
const FAITES = new Set(['livree', 'facturee', 'payee'])

export interface KpiPeriode {
  /** Courses de la période, hors annulées. */
  nbCourses: number
  nbAFaire: number
  nbFaites: number
  /** CA HT de la période (hors annulées, lignes supplémentaires comprises). */
  caHtCts: number
  /** Livrées pas encore facturées (HT). */
  aFacturerHtCts: number
  nbAFacturer: number
  /** Facturées non payées (TTC) et, dedans, celles dont l'échéance est passée. */
  aEncaisserTtcCts: number
  nbAEncaisser: number
  retardTtcCts: number
  nbRetard: number
}

/**
 * Chiffres de la période affichée. Les lignes hors période sont ignorées
 * (bornes locales incluses) : la fonction reste juste même si on lui en passe
 * davantage. `aujourdhui` ('AAAA-MM-JJ' local) sert au retard de paiement.
 */
export function kpiSummary(rows: DeliveryRow[], periode: Periode, aujourdhui: string): KpiPeriode {
  const k: KpiPeriode = {
    nbCourses: 0, nbAFaire: 0, nbFaites: 0, caHtCts: 0,
    aFacturerHtCts: 0, nbAFacturer: 0,
    aEncaisserTtcCts: 0, nbAEncaisser: 0, retardTtcCts: 0, nbRetard: 0,
  }
  for (const r of rows) {
    if (r.statut === 'annulee' || !dansPeriode(r.date, periode)) continue
    k.nbCourses += 1
    if (OUVERTES.has(r.statut)) k.nbAFaire += 1
    if (FAITES.has(r.statut)) k.nbFaites += 1
    const ht = deliveryTotalHtCts(r)
    k.caHtCts += ht
    if (r.statut === 'livree') { k.aFacturerHtCts += ht; k.nbAFacturer += 1 }
    if (r.statut === 'facturee') {
      const ttc = deliveryTotalTtcCts(r)
      k.aEncaisserTtcCts += ttc
      k.nbAEncaisser += 1
      const delai = r.clients?.payment_terms ?? DELAI_PAIEMENT_DEFAUT
      if (r.invoiced_at && echeanceFacture(r.invoiced_at, delai) < aujourdhui) {
        k.retardTtcCts += ttc
        k.nbRetard += 1
      }
    }
  }
  return k
}

// ── Affichage d'une ligne ────────────────────────────────────────────────────

const EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

/** 123456 cts → « 1 235 € » : les cartes chiffrées s'arrondissent à l'euro. */
export function eurosArrondis(cts: number): string {
  return EUROS.format(Math.round(cts / 100))
}

/** 'AAAA-MM-JJ' → '30/09' (année courante) ou '30/09/25', sans passer par UTC. */
export function dateCourte(iso: string, anneeCourante: number): string {
  const [a, m, j] = iso.slice(0, 10).split('-')
  return Number(a) === anneeCourante ? `${j}/${m}` : `${j}/${m}/${a.slice(2)}`
}

/** '14:30:00' → '14:30' ; '9:05' → '09:05' ; vide / illisible → null. */
export function heureCourte(t: string | null | undefined): string | null {
  const m = t ? /^(\d{1,2}):(\d{2})/.exec(t) : null
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}

/**
 * Ville d'une adresse libre : ce qui suit le code postal (« 67000 Strasbourg »),
 * sinon le dernier morceau après une virgule, sinon l'adresse entière.
 */
export function villeDe(adresse: string | null | undefined): string {
  const a = adresse?.trim()
  if (!a) return ''
  const cp = /\b\d{5}\s+([^,]+)/.exec(a)
  if (cp) return cp[1].trim()
  const morceaux = a.split(',').map(s => s.trim()).filter(Boolean)
  return morceaux.length > 1 ? morceaux[morceaux.length - 1] : a
}

/**
 * Trajet d'une course : court (villes) pour la colonne, complet pour
 * l'infobulle. Sans adresse d'enlèvement, la course part du dépôt.
 */
export function trajet(pickup: string | null | undefined, livraison: string | null | undefined) {
  const depart = pickup?.trim() ? villeDe(pickup) : 'Dépôt'
  const arrivee = livraison?.trim() ? villeDe(livraison) : '—'
  return {
    court: `${depart} → ${arrivee}`,
    complet: `${pickup?.trim() || 'Dépôt'} → ${livraison?.trim() || '—'}`,
  }
}

// ── Recherche & erreurs d'Edge ──────────────────────────────────────────────

/**
 * Nettoie un texte de recherche pour un filtre PostgREST `or(… ilike …)` :
 * virgule, parenthèses, guillemets, jokers et « : » y ont un sens.
 */
export function nettoyerRecherche(q: string | null | undefined): string {
  return (q ?? '').replace(/[,()"'*%\\:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

/**
 * Message lisible du corps d'une réponse d'erreur d'Edge Function (JSON
 * `{ error }` ou `{ message }`, sinon texte brut). null si rien d'exploitable.
 */
export function messageDepuisCorps(corps: string | null | undefined): string | null {
  const t = corps?.trim()
  if (!t) return null
  try {
    const j = JSON.parse(t) as { error?: unknown; message?: unknown } | null
    const m = typeof j?.error === 'string' ? j.error : typeof j?.message === 'string' ? j.message : null
    return m?.trim() || null
  } catch {
    return t.startsWith('<') ? null : t.slice(0, 300)
  }
}

/**
 * Le délai de paiement d'un client, tel qu'on peut le dire à l'écran.
 *
 * Deux colonnes le portent et elles ne disent pas la même chose :
 * `payment_terms_label` porte la forme convenue (« 30 jours fin de mois »),
 * `payment_terms` porte le nombre de jours qui sert RÉELLEMENT au calcul de
 * l'échéance envoyée à Pennylane.
 *
 * On affiche les deux quand ils diffèrent. C'est le nombre qui décide de la
 * date d'échéance, donc de l'alerte de retard : le lire évite de croire qu'un
 * « fin de mois » vaut trente jours pile.
 */
export function libelleDelaiPaiement(
  c: { payment_terms: number | null; payment_terms_label: string | null },
): string {
  const jours = c.payment_terms
  const etiquette = c.payment_terms_label?.trim()
  if (jours == null && !etiquette) return 'non renseigné'
  if (!etiquette) return `${jours} jours`
  if (jours == null) return etiquette
  return etiquette === String(jours) ? `${jours} jours` : `${etiquette} (${jours} jours)`
}
