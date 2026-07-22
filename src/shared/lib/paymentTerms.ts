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
}

export const PAYMENT_TERM_OPTIONS: PaymentTermOption[] = [
  { code: 'reception',   label: 'À réception',            days: 0 },
  { code: '15',          label: '15 jours',                days: 15 },
  { code: '30',          label: '30 jours',                days: 30 },
  { code: '45',          label: '45 jours',                days: 45 },
  { code: '60',          label: '60 jours',                days: 60 },
  { code: '30_fin_mois', label: '30 jours fin de mois',    days: 30 },
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
