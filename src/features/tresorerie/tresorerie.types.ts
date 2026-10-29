export interface TreasurySnapshot {
  balance_cts: number
  authorized_balance_cts: number
  iban: string | null
  source: string | null
  fetched_at: string
}

export type CompteBanque = 'qonto' | 'swan'

export type TxSide = 'credit' | 'debit'

export interface QontoTx {
  /** uuid DB — cible des charge_allocations (target_id). */
  id: string
  qonto_id: string
  label: string | null
  amount_cts: number
  side: TxSide
  operation_type: string | null
  settled_at: string | null
  charge_id: string | null
  justif_type: string | null
  /** Banque d'origine : 'qonto' ou 'swan' (compte pro Pennylane). */
  source: CompteBanque
}
