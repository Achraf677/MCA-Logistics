import type { QuoteStatus, Quote, UniteDevis } from './devis.types'
import { addTva } from '../../shared/lib/money'
import type { DeliveryExtraLine } from '../../shared/lib/money'
import type { Prestation } from '../../shared/lib/prestations'

export const STATUS_LABELS: Record<QuoteStatus, string> = {
  brouillon: 'Brouillon',
  envoye:    'Envoyé',
  accepte:   'Accepté',
  refuse:    'Refusé',
  expire:    'Expiré',
  facture:   'Facturé',
  transforme: 'Transformé',
}

export const STATUS_COLORS: Record<QuoteStatus, 'muted' | 'info' | 'success' | 'danger' | 'warning' | 'purple'> = {
  brouillon: 'muted',
  envoye:    'info',
  accepte:   'success',
  refuse:    'danger',
  expire:    'warning',
  facture:   'purple',
  transforme: 'info',
}

/** Devis envoyé dont la date de validité est passée (`aujourdhui` = AAAA-MM-JJ local). */
export function isExpiredDisplay(valid_until: string | null, statut: QuoteStatus, aujourdhui: string): boolean {
  return statut === 'envoye' && !!valid_until && valid_until < aujourdhui
}

/** AAAA-MM-JJ + n jours, en date locale (jamais d'UTC : pas de veille avant 2 h). */
export function addDays(isoDate: string, days: number): string {
  const [a, m, j] = isoDate.split('-').map(Number)
  const d = new Date(a, m - 1, j + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Ligne principale : quantité × prix unitaire ──────────────────────────────

export const UNITES: UniteDevis[] = ['colis', 'km', 'palette', 'forfait']

export const LIBELLES_UNITE: Record<UniteDevis, { court: string; prix: string; quantite: string }> = {
  colis:   { court: 'colis',   prix: 'Prix au colis',    quantite: 'Colis' },
  km:      { court: 'km',      prix: 'Prix au km',       quantite: 'Kilomètres' },
  palette: { court: 'palette', prix: 'Prix à la palette', quantite: 'Palettes' },
  forfait: { court: 'forfait', prix: 'Prix du forfait',  quantite: 'Quantité' },
}

/**
 * Unité proposée pour un nouveau devis : la messagerie se chiffre au colis ;
 * sinon l'unité du tarif du client (colis, km, palette), à défaut un forfait.
 */
export function uniteParDefaut(prestation: Prestation | null, tariffMode: string | null | undefined): UniteDevis {
  if (prestation === 'messagerie') return 'colis'
  if (tariffMode === 'colis' || tariffMode === 'km' || tariffMode === 'palette') return tariffMode
  return 'forfait'
}

/**
 * Prix unitaire proposé : celui du tarif du client s'il est exprimé dans la
 * même unité (une seule saisie : le tarif vit dans la fiche client).
 */
export function prixParDefaut(
  unite: UniteDevis,
  client: { tariff_mode: string | null; tariff_rate_cts: number | null } | null | undefined,
): number | null {
  if (!client || client.tariff_rate_cts == null || unite === 'forfait') return null
  return client.tariff_mode === unite ? client.tariff_rate_cts : null
}

export interface MontantsDevis {
  principalHtCts: number
  supplementsHtCts: number
  htCts: number
  tvaCts: number
  ttcCts: number
}

function qte(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? v : 1
}

/**
 * Montants du devis. Un seul taux pour tout le devis (une ligne Pennylane au
 * taux effectif) ; TVA calculée sur le HT total ; 0 en autoliquidation.
 */
export function montantsDevis(d: {
  quantite: number | null
  prix_unitaire_cts: number | null
  extra_lines: DeliveryExtraLine[] | null | undefined
  tva_rate: number
  autoliquidation: boolean
}): MontantsDevis {
  const principalHtCts = Math.round(qte(d.quantite) * Math.max(0, d.prix_unitaire_cts ?? 0))
  const supplementsHtCts = (d.extra_lines ?? []).reduce(
    (s, l) => s + Math.round(qte(l.quantity) * Math.max(0, Number(l.amount_ht_cts) || 0)), 0)
  const htCts = principalHtCts + supplementsHtCts
  const tvaCts = d.autoliquidation ? 0 : addTva(htCts, d.tva_rate / 100) - htCts
  return { principalHtCts, supplementsHtCts, htCts, tvaCts, ttcCts: htCts + tvaCts }
}

/** « 3 000 colis × 1,00 € » — résumé de la ligne principale. */
export function resumeLigne(unite: UniteDevis, quantite: number | null, prixCts: number | null): string {
  const q = qte(quantite)
  const prix = ((prixCts ?? 0) / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
  if (unite === 'forfait') return q === 1 ? `Forfait ${prix}` : `${q.toLocaleString('fr-FR')} × ${prix}`
  return `${q.toLocaleString('fr-FR')} ${LIBELLES_UNITE[unite].court} × ${prix}`
}

/** Ancien devis (montant global seul) : relu comme « 1 × HT ». */
export function ligneDepuisAncien(q: Pick<Quote, 'unite' | 'quantite' | 'prix_unitaire_cts' | 'amount_ht_cts' | 'extra_lines'>): {
  unite: UniteDevis; quantite: number; prix_unitaire_cts: number
} {
  if (q.prix_unitaire_cts != null) {
    return { unite: q.unite ?? 'forfait', quantite: qte(q.quantite), prix_unitaire_cts: q.prix_unitaire_cts }
  }
  const supplements = (q.extra_lines ?? []).reduce(
    (s, l) => s + Math.round(qte(l.quantity) * (Number(l.amount_ht_cts) || 0)), 0)
  return { unite: 'forfait', quantite: 1, prix_unitaire_cts: Math.max(0, (q.amount_ht_cts ?? 0) - supplements) }
}

// ── Devis accepté : effets ───────────────────────────────────────────────────

/**
 * Course créée depuis un devis accepté : tout ce que le devis sait est repris
 * (prestation, référence, adresses, exécution, colis / km, suppléments) ; la
 * ligne principale devient le montant de la course, les suppléments ses
 * `extra_lines` au même taux.
 */
export function versLivraison(q: Quote, date: string, companyId: string) {
  const unite = q.unite ?? 'forfait'
  const m = montantsDevis({
    quantite: q.quantite, prix_unitaire_cts: q.prix_unitaire_cts ?? ligneDepuisAncien(q).prix_unitaire_cts,
    extra_lines: [], tva_rate: q.tva_rate ?? 20, autoliquidation: q.autoliquidation,
  })
  const taux = q.tva_rate ?? 20
  return {
    company_id: companyId,
    client_id: q.client_id,
    quote_id: q.id,
    date,
    statut: 'planifiee' as const,
    prestation: q.prestation,
    description: q.description,
    reference_client: q.reference_client,
    pickup_address: q.pickup_address,
    delivery_address: q.delivery_address,
    vehicle_id: q.vehicle_id,
    driver_id: q.driver_id,
    nb_colis: unite === 'colis' && q.quantite != null ? Math.round(q.quantite) : null,
    km: unite === 'km' && q.quantite != null ? Number(q.quantite) : null,
    amount_ht_cts: m.principalHtCts,
    tva_rate: taux,
    tva_cts: m.tvaCts,
    amount_ttc_cts: m.ttcCts,
    autoliquidation: q.autoliquidation,
    extra_lines: (q.extra_lines ?? []).map(l => ({ ...l, tva_rate: taux })),
  }
}

/**
 * Tarif à écrire dans la fiche client quand on applique un devis accepté
 * (messagerie : prix au colis). `null` = rien à appliquer (forfait, prix nul).
 */
export function tarifDepuisDevis(q: Pick<Quote, 'unite' | 'prix_unitaire_cts' | 'prestation'>): {
  tariff_mode: 'colis' | 'km' | 'palette'; tariff_rate_cts: number; prestation_defaut?: Prestation
} | null {
  if (!q.unite || q.unite === 'forfait' || !q.prix_unitaire_cts || q.prix_unitaire_cts <= 0) return null
  return {
    tariff_mode: q.unite,
    tariff_rate_cts: q.prix_unitaire_cts,
    ...(q.prestation ? { prestation_defaut: q.prestation } : {}),
  }
}

/** Un relevé de messagerie ne se « transforme » pas en course : on applique le prix au client. */
export function seTransformeEnCourse(prestation: Prestation | null): boolean {
  return prestation !== 'messagerie' && prestation !== 'forfait'
}
