import { Unlink } from 'lucide-react'
import { FacturePdfLink } from './FacturePdfLink'
import { formatCents } from '../lib/money'
import type { ChargePick } from '../types/charges'

interface Props {
  charge: ChargePick
  onDetach: () => void
}

export function LinkedChargeCard({ charge, onDetach }: Props) {
  return (
    <div className="rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)] px-4 py-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">
          Facture liée
        </span>
        <button
          onClick={onDetach}
          className="flex items-center gap-1 text-[var(--fs-xs)] text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
        >
          <Unlink size={12} />
          Détacher
        </button>
      </div>
      <p className="text-[var(--fs-sm)] font-medium text-[var(--text)] truncate">{charge.label}</p>
      <div className="flex items-center gap-3">
        {charge.montant_ttc_cts != null && (
          <span className="font-mono text-[var(--fs-sm)] text-[var(--text)]">
            {formatCents(charge.montant_ttc_cts)}
          </span>
        )}
        <FacturePdfLink
          pennylane_id={charge.pennylane_id}
          receipt_url={charge.receipt_url}
          label="Facture PDF"
          className="inline-flex items-center gap-1 text-[var(--fs-xs)] text-[var(--brand)] hover:underline disabled:opacity-50"
        />
      </div>
    </div>
  )
}
