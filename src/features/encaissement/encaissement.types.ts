/** Encaissement = livraison statut='payee' lue depuis deliveries (Pennylane pilote). */
export interface EncaissementRow {
  id: string
  client_name: string
  effective_ttc_cts: number
  invoiced_at: string | null
  paid_at: string | null
  pennylane_invoice_id: string | null
}

/** Crédit Qonto hors paiement client (CCA, remboursement, autre, non identifié). */
export interface AutreEntreeRow {
  qonto_id: string
  label: string | null
  amount_cts: number
  settled_at: string | null
  justif_type: string | null
}

export interface EncaissementFilters {
  client_id?: string | 'all'
  date_from?: string
  date_to?: string
}
