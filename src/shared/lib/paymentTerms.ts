// Délai de paiement façon Pennylane — un select à valeurs fixes plutôt qu'un
// input libre. `payment_terms` (int, jours) reste la seule source utilisée par
// la logique d'encours/retard (aRapprocher, clients.logic) ; le code ci-dessous
// est purement affichage + calcul d'échéance (cas particulier "fin de mois").

export interface PaymentTermOption {
  /** Code stocké en base (clients.payment_terms_label). */
  code: string
  /** Libellé exact affiché dans le select. */
  label: string
  /** Jours à ajouter — utilisé pour la logique d'encours existante. */
  days: number
  /**
   * Conforme au transport routier : L441-11 C. com. plafonne le délai à
   * 30 jours à compter de la date d'émission de la facture (« fin de mois »
   * interdit). Les autres ne restent que pour les anciens clients.
   */
  conforme: boolean
}

export const PAYMENT_TERM_OPTIONS: PaymentTermOption[] = [
  { code: 'reception',   label: 'À réception',            days: 0,  conforme: true },
  { code: '15',          label: '15 jours',                days: 15, conforme: true },
  { code: '30',          label: '30 jours',                days: 30, conforme: true },
  { code: '45',          label: '45 jours',                days: 45, conforme: false },
  { code: '60',          label: '60 jours',                days: 60, conforme: false },
  { code: '30_fin_mois', label: '30 jours fin de mois',    days: 30, conforme: false },
]

const DEFAULT_CODE = '30'

/** Jours (int) associés à un code — alimente encours/retard, inchangé. */
export function paymentTermDays(code: string | null | undefined): number {
  return PAYMENT_TERM_OPTIONS.find(o => o.code === code)?.days
    ?? PAYMENT_TERM_OPTIONS.find(o => o.code === DEFAULT_CODE)!.days
}

/** Libellé affiché pour un code (fallback "30 jours" si absent/inconnu). */
export function paymentTermLabel(code: string | null | undefined): string {
  return PAYMENT_TERM_OPTIONS.find(o => o.code === code)?.label
    ?? PAYMENT_TERM_OPTIONS.find(o => o.code === DEFAULT_CODE)!.label
}

/** Code par défaut dérivé d'un `payment_terms` (int) legacy, pour les clients
 *  sans `payment_terms_label` (colonne ajoutée après coup). 30 → "30 jours",
 *  jamais "30 jours fin de mois" (indiscernable depuis le seul entier). */
export function defaultPaymentTermCode(days: number): string {
  return PAYMENT_TERM_OPTIONS.find(o => o.code !== '30_fin_mois' && o.days === days)?.code
    ?? DEFAULT_CODE
}

/** Code effectif à afficher : `label` si renseigné, sinon dérivé de `days`. */
export function resolvePaymentTermCode(
  label: string | null | undefined,
  days: number,
): string {
  return label ?? defaultPaymentTermCode(days)
}

/** Échéance calculée depuis une date ISO de référence (ex : date de facture).
 *  "30 jours fin de mois" : J+30 puis arrondi au dernier jour de ce mois-là
 *  (convention Pennylane). Les autres codes : simple J+N. */
export function computeDeadline(code: string | null | undefined, fromIso: string): string {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`)
  if (code === '30_fin_mois') {
    from.setUTCDate(from.getUTCDate() + 30)
    const endOfMonth = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0))
    return endOfMonth.toISOString().slice(0, 10)
  }
  from.setUTCDate(from.getUTCDate() + paymentTermDays(code))
  return from.toISOString().slice(0, 10)
}

/** Délai conforme au transport (≤ 30 j date de facture) ? Inconnu = conforme (30 j par défaut). */
export function delaiConforme(code: string | null | undefined): boolean {
  return PAYMENT_TERM_OPTIONS.find(o => o.code === code)?.conforme ?? true
}

/**
 * Délai EFFECTIF en jours pour calculer une échéance en transport : le délai
 * du client, plafonné à 30 jours (L441-11 C. com. — les factures partent à
 * 30 j max, voir l'Edge pennylane-invoice). Sert aux retards, relances, encours.
 */
export function delaiTransportJours(jours: number | null | undefined): number {
  const n = Number.isFinite(Number(jours)) ? Math.max(0, Number(jours)) : 30
  return Math.min(jours == null ? 30 : n, 30)
}

// Libellé du délai de paiement d'un client (fiche livraison, devis).
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
