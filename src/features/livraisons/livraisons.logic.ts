import {
  addTva, deliveryTotalHtCts, deliveryTotalTtcCts,
  extraLinesHtCts as extraLinesHtCtsLocal,
  extraLinesTvaCts as extraLinesTvaCtsLocal,
} from '../../shared/lib/money'
import type { DeliveryExtraLine, DeliveryRow } from './livraisons.types'

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

// ── Facturation bloquée (transition exceptionnelle facturee → livree) ─────────
//
// Avant le lot « l'argent ne se perd plus », le statut passait à `facturee`
// AVANT l'appel Pennylane. Quand Pennylane refusait (taux non légal, ligne
// invalide…), la course restait « Facturée » sans facture ni cause, et plus
// aucun bouton ne permettait de la refacturer.
//
// Ces courses se reconnaissent à coup sûr : statut `facturee`, `sync_pending`
// levé, et AUCUNE facture Pennylane rattachée. Pour elles seules, la fiche
// propose « Revenir à livrée » — hors machine à états (TRANSITIONS reste
// inchangée : `facturee → livree` n'y figure pas), parce qu'il ne s'agit pas
// d'un retour en arrière métier mais de la réparation d'un état qui n'aurait
// jamais dû exister. Dès qu'une facture existe (`pennylane_invoice_id`), le
// geste disparaît : une facture émise ne se défait que par un avoir.

export interface EtatFacturation {
  statut: string
  sync_pending?: boolean | null
  pennylane_invoice_id?: string | null
}

export function estFacturationBloquee(d: EtatFacturation): boolean {
  return d.statut === 'facturee' && d.sync_pending === true && !d.pennylane_invoice_id
}

// ── Taux de TVA d'une course existante ────────────────────────────────────────

/**
 * Taux (en %) à afficher en ouvrant une course. Le taux STOCKÉ fait foi
 * (5,5 reste 5,5) ; à défaut on le déduit de TVA / HT au dixième ; à défaut 20.
 * L'ancien calcul arrondissait à l'entier : une course à 5,5 % se rouvrait à 6 %.
 */
export function tauxTvaInitial(d: {
  tva_rate?: number | string | null
  tva_cts?: number | null
  amount_ht_cts?: number | null
  montant_ht_cts?: number | null
}): number {
  if (d.tva_rate != null && d.tva_rate !== '') {
    const n = Number(d.tva_rate)
    if (Number.isFinite(n) && n >= 0 && n <= 100) return n
  }
  const ht = d.amount_ht_cts ?? d.montant_ht_cts ?? 0
  if (d.tva_cts != null && ht > 0) return Math.round(d.tva_cts / ht * 1000) / 10
  return 20
}

// ── Montants à écrire à l'enregistrement ─────────────────────────────────────

export interface MontantsPersistes {
  amount_ht_cts?: number
  tva_cts?: number
  amount_ttc_cts?: number
  tva_rate?: number
}

/**
 * Colonnes de montant à écrire depuis le formulaire. Règle : un montant
 * EXISTANT n'est JAMAIS effacé faute de calcul. Quand `computed` est nul
 * (client introuvable, tarif incomplet…), on n'écrit ni HT, ni TVA, ni TTC :
 * la base garde ses valeurs.
 *
 * En AUTOLIQUIDATION : taux 0, TVA 0, TTC = HT (le HT connu : calculé, sinon
 * celui déjà en base).
 */
export function montantsAEcrire(
  computed: ComputedAmount | null,
  opts: { autoliquidation: boolean; tauxPct: number; htExistantCts?: number | null },
): MontantsPersistes {
  if (opts.autoliquidation) {
    const ht = computed?.amount_ht_cts ?? opts.htExistantCts ?? null
    const out: MontantsPersistes = { tva_rate: 0, tva_cts: 0 }
    if (ht != null) out.amount_ttc_cts = ht
    if (computed) out.amount_ht_cts = computed.amount_ht_cts
    return out
  }
  if (!computed) return {}
  return {
    amount_ht_cts: computed.amount_ht_cts,
    tva_cts: computed.tva_cts,
    amount_ttc_cts: computed.amount_ttc_cts,
    tva_rate: opts.tauxPct,
  }
}

// ── Récapitulatif HT / TVA / TTC de la fiche ─────────────────────────────────

export interface RecapMontant {
  ht_cts: number | null
  tva_cts: number | null
  extras_ht_cts: number
  extras_tva_cts: number
  /** TTC total (principale + extras), null si rien n'est connu. */
  ttc_total_cts: number | null
  /** Taux imposé aux lignes supplémentaires (0 en autoliquidation), sinon null. */
  taux_extras_force: number | null
}

/**
 * Récapitulatif affiché sous le formulaire. En autoliquidation, la TVA n'est
 * pas facturée — ni sur la ligne principale, ni sur les lignes
 * supplémentaires, qui partent elles aussi en code autoliquidation : TVA 0,
 * TTC = HT.
 */
export function recapMontant(input: {
  ht_cts: number | null
  tva_cts: number | null
  ttc_cts: number | null
  extraLines: DeliveryExtraLine[] | null | undefined
  autoliquidation: boolean
}): RecapMontant {
  const lignes = input.extraLines ?? []
  const extrasHt = extraLinesHtCtsLocal(lignes)
  if (input.autoliquidation) {
    const ht = input.ht_cts
    return {
      ht_cts: ht,
      tva_cts: ht != null ? 0 : null,
      extras_ht_cts: extrasHt,
      extras_tva_cts: 0,
      ttc_total_cts: ht != null ? ht + extrasHt : (lignes.length > 0 ? extrasHt : null),
      taux_extras_force: 0,
    }
  }
  const extrasTva = extraLinesTvaCtsLocal(lignes)
  const ttc = input.ttc_cts
  return {
    ht_cts: input.ht_cts,
    tva_cts: input.tva_cts,
    extras_ht_cts: extrasHt,
    extras_tva_cts: extrasTva,
    ttc_total_cts: ttc != null
      ? ttc + extrasHt + extrasTva
      : (lignes.length > 0 ? extrasHt + extrasTva : null),
    taux_extras_force: null,
  }
}

// ── Fiche unique : prestation, créneaux, ce qui manque à chaque étape ───────

/**
 * Type de prestation — décide des blocs de la fiche. `null` (anciennes
 * courses) se lit comme `express`.
 */
export type Prestation = 'express' | 'messagerie' | 'dediee' | 'mise_a_dispo' | 'forfait'

export const PRESTATIONS: Prestation[] = ['express', 'messagerie', 'dediee', 'mise_a_dispo', 'forfait']

export const PRESTATION_LABELS: Record<Prestation, string> = {
  express:      'Express',
  messagerie:   'Messagerie',
  dediee:       'Course dédiée',
  mise_a_dispo: 'Mise à disposition',
  forfait:      'Forfait / relevé',
}

export const PRESTATION_AIDES: Record<Prestation, string> = {
  express:      'Une course : un retrait, une livraison, souvent dans la journée.',
  messagerie:   'Colis de tournée : colis comptés, preuve par colis.',
  dediee:       'Véhicule réservé pour un client, prix au forfait.',
  mise_a_dispo: 'Véhicule et chauffeur à disposition sur un lieu, à l’heure ou à la journée.',
  forfait:      'Facturation globale (mois, période) : aucun arrêt à saisir.',
}

export interface BlocsPrestation {
  /** Bloc « Retrait » affiché. */
  retrait: boolean
  /** Bloc « Livraison » (ou « Lieu ») affiché. */
  livraison: boolean
  /** Titre du bloc livraison. */
  titreLivraison: string
  /** L'adresse de livraison / du lieu est exigée pour partir. */
  adresseExigee: boolean
  /** Le bloc marchandise est pertinent. */
  marchandise: boolean
  /** Le chauffeur et le véhicule sont exigés pour partir. */
  execution: boolean
}

export function blocsPrestation(p: Prestation | null | undefined): BlocsPrestation {
  switch (p ?? 'express') {
    case 'forfait':
      return { retrait: false, livraison: false, titreLivraison: 'Livraison', adresseExigee: false, marchandise: false, execution: false }
    case 'mise_a_dispo':
      return { retrait: false, livraison: true, titreLivraison: 'Lieu de mise à disposition', adresseExigee: true, marchandise: false, execution: true }
    default:
      return { retrait: true, livraison: true, titreLivraison: 'Livraison', adresseExigee: true, marchandise: true, execution: true }
  }
}

/** « HH:MM » depuis une colonne `time` (« HH:MM:SS ») ; '' si vide. */
export function heureSaisie(t: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '')
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''
}

/** Créneau incohérent : fin avant (ou égale au) début. Vide d'un côté = valide. */
export function creneauInvalide(debut: string, fin: string): boolean {
  return !!debut && !!fin && fin <= debut
}

/** « 9h – 12h », « avant 14h30 », « à partir de 8h » ; null si vide. */
export function libelleCreneau(debut: string | null | undefined, fin: string | null | undefined): string | null {
  const h = (t: string) => {
    const [hh, mm] = heureSaisie(t).split(':')
    return `${Number(hh)}h${mm === '00' ? '' : mm}`
  }
  const d = heureSaisie(debut), f = heureSaisie(fin)
  if (d && f) return `${h(d)} – ${h(f)}`
  if (f) return `avant ${h(f)}`
  if (d) return `à partir de ${h(d)}`
  return null
}

/** « 1 h 05 », « 25 min ». */
export function libelleDuree(min: number | null | undefined): string | null {
  if (min == null || !Number.isFinite(min) || min <= 0) return null
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

/** Ce que lit le bandeau « Il manque » — valeurs du formulaire, en chaînes. */
export interface FicheASaisir {
  prestation: Prestation | null | ''
  client_id: string
  date: string
  pickup_address: string
  delivery_address: string
  driver_id: string
  vehicle_id: string
  expediteur_nom: string
  destinataire_nom: string
  marchandise_desc: string
  nb_colis: string
  poids_kg_reel: string
  volume_m3: string
  /** HT de la ligne principale en centimes (0 / null = absent). */
  ht_cts: number | null
  creneau_retrait_debut: string
  creneau_retrait_fin: string
  creneau_livraison_debut: string
  creneau_livraison_fin: string
}

export interface Manques {
  /** Bloque l'enregistrement. */
  enregistrer: string[]
  /** Manque pour que le chauffeur puisse partir. */
  partir: string[]
  /** Manque pour la lettre de voiture (arrêté du 9/11/1999). */
  lv: string[]
  /** Manque pour facturer. */
  facturer: string[]
}

/**
 * Validation PROGRESSIVE : seul l'enregistrement bloque (client + date, et
 * créneaux cohérents) ; le reste s'affiche comme « il manque pour… » sans
 * empêcher d'enregistrer une course encore incomplète.
 */
export function manquesFiche(f: FicheASaisir): Manques {
  const b = blocsPrestation(f.prestation || null)
  const vide = (s: string) => !s || !s.trim()
  const enregistrer: string[] = []
  if (vide(f.client_id)) enregistrer.push('client')
  if (vide(f.date)) enregistrer.push('date')
  if (creneauInvalide(f.creneau_retrait_debut, f.creneau_retrait_fin)) enregistrer.push('créneau de retrait (fin avant début)')
  if (creneauInvalide(f.creneau_livraison_debut, f.creneau_livraison_fin)) enregistrer.push('créneau de livraison (fin avant début)')

  const partir: string[] = []
  if (b.adresseExigee && vide(f.delivery_address)) partir.push(b.retrait ? 'adresse de livraison' : 'adresse du lieu')
  if (b.execution && vide(f.driver_id)) partir.push('chauffeur')
  if (b.execution && vide(f.vehicle_id)) partir.push('véhicule')

  const lv: string[] = []
  if (b.marchandise) {
    if (vide(f.pickup_address)) lv.push('adresse de retrait')
    if (vide(f.delivery_address)) lv.push('adresse de livraison')
    if (vide(f.expediteur_nom)) lv.push('expéditeur')
    if (vide(f.destinataire_nom)) lv.push('destinataire')
    if (vide(f.marchandise_desc)) lv.push('nature de la marchandise')
    if (vide(f.nb_colis)) lv.push('nombre de colis')
    // Loi : poids OU volume (arrêté du 9/11/1999, art. 4).
    if (vide(f.poids_kg_reel) && vide(f.volume_m3)) lv.push('poids ou volume')
  }

  const facturer: string[] = []
  if (!f.ht_cts || f.ht_cts <= 0) facturer.push('prix HT')

  return { enregistrer, partir, lv, facturer }
}
