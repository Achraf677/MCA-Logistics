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

export const STATUS_COLORS: Record<string, 'muted' | 'info' | 'warning' | 'success' | 'danger'> = {
  planifiee: 'muted',
  en_cours:  'info',
  livree:    'warning',
  facturee:  'warning',
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

// ── KPIs ─────────────────────────────────────────────────────────────────────

export function kpiSummary(rows: DeliveryRow[]) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

  const active   = rows.filter(r => r.statut !== 'annulee')
  const thisMonth = active.filter(r => r.date >= monthStart)

  const factureesOuPayees = active.filter(r => r.statut === 'facturee' || r.statut === 'payee')
  // Convention compta : le CA s'exprime HT ; on garde le TTC pour la sous-ligne
  // « TVA · TTC » affichée sous le gros chiffre HT dans la carte KPI.
  const caFactureHtCts  = factureesOuPayees.reduce((s, r) => s + deliveryTotalHtCts(r), 0)
  const caFactureCts    = factureesOuPayees.reduce((s, r) => s + deliveryTotalTtcCts(r), 0)

  const enAttenteFacturation = active.filter(r => r.statut === 'livree').length

  const enAttentePaiementCts = active
    .filter(r => r.statut === 'facturee')
    .reduce((s, r) => s + deliveryTotalTtcCts(r), 0)

  return {
    nbMois: thisMonth.length,
    caFactureHtCts,
    caFactureCts,
    enAttenteFacturation,
    enAttentePaiementCts,
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
