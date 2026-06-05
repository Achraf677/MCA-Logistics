import { formatMoney } from '../../shared/lib/money'
import type { QontoTx, TxSide } from './tresorerie.types'

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
