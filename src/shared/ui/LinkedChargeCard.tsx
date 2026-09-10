import { Unlink } from 'lucide-react'
import { FacturePdfLink } from './FacturePdfLink'
import { formatCents } from '../lib/money'
import type { ChargePick } from '../types/charges'

interface Props {
  charge: ChargePick
  onDetach: () => void
  /**
   * Reste dû de la facture APRÈS imputation de tous les débits rattachés,
   * celui de cette transaction compris. `0` = soldée, `> 0` = règlement
   * fractionné en cours (assurance annuelle prélevée mensuellement, par ex.).
   * Omis = on n'affiche aucun solde.
   */
  resteCts?: number | null
}

export function LinkedChargeCard({ charge, onDetach, resteCts }: Props) {
  const totalCts = charge.montant_ttc_cts
  const fractionne = resteCts != null && totalCts != null && resteCts > 0
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

      {fractionne ? (
        <p className="text-[var(--fs-xs)] text-[var(--gold)]">
          Reste dû <span className="font-mono">{formatCents(resteCts)}</span> sur{' '}
          <span className="font-mono">{formatCents(totalCts)}</span>
        </p>
      ) : resteCts === 0 ? (
        <p className="text-[var(--fs-xs)] text-[var(--success)]">Facture soldée</p>
      ) : null}
    </div>
  )
}
