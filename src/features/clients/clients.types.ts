export type TariffMode = 'forfait' | 'km' | 'palette' | 'manuel'

export interface Client {
  id: string
  company_id: string
  name: string
  siret: string | null
  tva_intra: string | null
  address: string | null
  city: string | null
  postal_code: string | null
  email: string | null
  phone: string | null
  type: 'medical' | 'ecommerce' | 'retail' | 'particulier' | 'professionnel' | null
  pennylane_id: string | null
  payment_terms: number
  /** Code du select façon Pennylane (migration 20260722100000). NULL = legacy,
   *  dérivé de `payment_terms` (voir shared/lib/paymentTerms.ts). */
  payment_terms_label: string | null
  notes: string | null
  active: boolean
  tariff_mode: TariffMode
  tariff_rate_cts: number | null
  created_at: string
  updated_at: string
}

export type ClientInsert = Omit<Client, 'id' | 'created_at' | 'updated_at' | 'pennylane_id'>
export type ClientUpdate = Partial<Omit<Client, 'id' | 'company_id' | 'created_at'>>

export interface ClientFilters {
  type?: Client['type'] | 'all'
  active?: boolean
  search?: string
  withEncours?: boolean
}

/** Minimal shape for encours calculations — fetched via a dedicated query, no livraisons feature import */
export interface DeliveryForEncours {
  id: string
  statut: string
  /** v2 column (from migration delta) */
  amount_ttc_cts: number | null
  /** legacy column */
  montant_ttc_cts: number | null
  invoiced_at: string | null
  /** client payment_terms in days — provided by caller */
  payment_terms: number
}

/** Livraison utilisée pour la liste Tiers (CA facturé + dernière livraison) —
 *  aucune import de features/livraisons (règle d'or archi), forme minimale. */
export interface DeliveryForTiersColumns extends DeliveryForEncours {
  client_id: string
  date: string
  /** Requis par deliveryTotalTtcCts (shared/lib/money.ts) pour le CA facturé. */
  extra_lines?: { label: string; quantity: number; amount_ht_cts: number; tva_rate: number }[] | null
}
