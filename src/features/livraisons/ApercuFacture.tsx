// Modale d'aperçu facture — montre EXACTEMENT ce que Pennylane facturera.
// Aucune requête réseau : purement dérivée des rows passés en props.
//
// Deux modes d'utilisation :
//   - Mono : DrawerLivraison, une seule DeliveryRow en cours de facturation.
//   - Multi : Livraisons.tsx, N livraisons cochées du même client.
// Dans les deux cas, un bouton "Facturer" à l'intérieur déclenche le flux
// existant (Edge pennylane-invoice) via `onFacturer`.

import { Loader2, FileText, X, AlertTriangle } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { formatCents } from '../../shared/lib/money'
import { buildApercuFacture, buildApercuPayload, type ApercuFactureRow, type ApercuInvalidExtra } from './apercuFacture.logic'

interface Props {
  open: boolean
  rows: ApercuFactureRow[]
  onFacturer: () => void
  onClose: () => void
  invoicing?: boolean
}

export function ApercuFacture({ open, rows, onFacturer, onClose, invoicing }: Props) {
  if (!open || rows.length === 0) return null
  const apercu = buildApercuFacture(rows)

  // Lignes supplémentaires que pennylane-invoice REJETTERAIT en l'état (taux
  // TVA hors barème légal, HT ≤ 0) — l'aperçu doit prévenir AVANT le clic sur
  // "Facturer", pas laisser l'Edge échouer silencieusement en arrière-plan.
  const invalidExtras: ApercuInvalidExtra[] = rows.flatMap(r => buildApercuPayload(r).invalidExtras)
  const hasInvalidExtras = invalidExtras.length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={() => { if (!invoicing) onClose() }}
    >
      <div
        className="w-full max-w-2xl bg-[var(--bg-card)] rounded-[var(--r-xl)] border border-[var(--border)]
          shadow-xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-[var(--brand)]" />
            <h2 className="font-semibold text-[var(--text)]">Aperçu de la facture</h2>
          </div>
          <button
            type="button"
            onClick={() => { if (!invoicing) onClose() }}
            aria-label="Fermer"
            className="p-1 rounded-[var(--r-sm)] text-[var(--text-muted)] hover:text-[var(--text)]
              hover:bg-[var(--bg-elevated)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Corps scroll */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Client */}
          <div className="flex items-center justify-between text-[var(--fs-sm)]">
            <span className="text-[var(--text-muted)]">Client facturé</span>
            <span className="font-medium text-[var(--text)]">{apercu.client_name}</span>
          </div>
          {apercu.mixed_clients && (
            <p className="text-[var(--danger)] text-[var(--fs-xs)]">
              Attention : livraisons de clients différents dans la sélection.
            </p>
          )}

          {/* Lignes principales — 1 ligne par livraison */}
          <Section title={`Ligne${apercu.main_lines.length > 1 ? 's' : ''} principale${apercu.main_lines.length > 1 ? 's' : ''} (${apercu.main_lines.length})`}>
            <table className="w-full text-[var(--fs-sm)]">
              <thead className="text-[var(--fs-xs)] text-[var(--text-muted)] uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium py-1.5 pl-3">Date</th>
                  <th className="text-left font-medium py-1.5 pr-2">Désignation</th>
                  <th className="text-right font-medium py-1.5">HT</th>
                  <th className="text-right font-medium py-1.5 pr-2">TVA %</th>
                  <th className="text-right font-medium py-1.5">TVA</th>
                  <th className="text-right font-medium py-1.5 pr-3">TTC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {apercu.main_lines.map(m => (
                  <tr key={m.delivery_id}>
                    <td className="py-1.5 pl-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)] whitespace-nowrap">
                      {formatDate(m.date)}
                    </td>
                    <td className="py-1.5 pr-2 text-[var(--text)] max-w-xs truncate" title={m.label}>
                      {m.label}
                    </td>
                    <td className="py-1.5 text-right font-mono">{formatCents(m.ht_cts)}</td>
                    <td className="py-1.5 pr-2 text-right font-mono text-[var(--text-muted)]">
                      {m.tva_rate}%
                    </td>
                    <td className="py-1.5 text-right font-mono">{formatCents(m.tva_cts)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono font-medium">{formatCents(m.ttc_cts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* Lignes supplémentaires */}
          {apercu.extra_lines.length > 0 && (
            <Section title={`Lignes supplémentaires (${apercu.extra_lines.length})`}>
              <table className="w-full text-[var(--fs-sm)]">
                <thead className="text-[var(--fs-xs)] text-[var(--text-muted)] uppercase tracking-wide">
                  <tr>
                    <th className="text-left font-medium py-1.5 pl-3">Libellé</th>
                    <th className="text-right font-medium py-1.5">Qté</th>
                    <th className="text-right font-medium py-1.5">HT unit.</th>
                    <th className="text-right font-medium py-1.5 pr-2">TVA %</th>
                    <th className="text-right font-medium py-1.5">TVA</th>
                    <th className="text-right font-medium py-1.5 pr-3">Total TTC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {apercu.extra_lines.map((e, i) => (
                    <tr key={`${e.delivery_id}-${i}`}>
                      <td className="py-1.5 pl-3 text-[var(--text)] max-w-xs truncate" title={e.label}>
                        {e.label}
                      </td>
                      <td className="py-1.5 text-right font-mono">{e.quantity}</td>
                      <td className="py-1.5 text-right font-mono">{formatCents(e.ht_unit_cts)}</td>
                      <td className="py-1.5 pr-2 text-right font-mono text-[var(--text-muted)]">
                        {e.tva_rate}%
                      </td>
                      <td className="py-1.5 text-right font-mono">{formatCents(e.tva_total_cts)}</td>
                      <td className="py-1.5 pr-3 text-right font-mono font-medium">{formatCents(e.ttc_total_cts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Totaux */}
          <div className="rounded-[var(--r-lg)] border border-[var(--border)] divide-y divide-[var(--border)]
            overflow-hidden bg-[var(--bg-elevated)]">
            <TotalRow label="Total HT" value={formatCents(apercu.totals.ht_cts)} />
            <TotalRow label="Total TVA" value={formatCents(apercu.totals.tva_cts)} />
            <TotalRow label="Total TTC" value={formatCents(apercu.totals.ttc_cts)} highlight />
          </div>

          {/* Mention n° facture */}
          <p className="text-[var(--fs-xs)] text-[var(--text-muted)] italic">
            N° de facture attribué à la validation (par Pennylane).
          </p>

          {/* Lignes supplémentaires invalides — bloquant, à corriger avant facturation */}
          {hasInvalidExtras && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-[var(--r-lg)]
              border border-[var(--danger)]/30 bg-[var(--danger)]/10 text-[var(--fs-sm)]">
              <AlertTriangle size={16} className="text-[var(--danger)] shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="text-[var(--text)] font-medium">
                  {invalidExtras.length} ligne{invalidExtras.length > 1 ? 's' : ''} supplémentaire{invalidExtras.length > 1 ? 's' : ''} invalide{invalidExtras.length > 1 ? 's' : ''} — à corriger avant facturation
                </span>
                <ul className="text-[var(--text-muted)] text-[var(--fs-xs)] flex flex-col gap-0.5">
                  {invalidExtras.map((e, i) => (
                    <li key={i}>« {e.label} » : {e.reason}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Pied — actions */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-[var(--border)]">
          <Button variant="primary" onClick={onFacturer} disabled={invoicing || hasInvalidExtras}
            title={hasInvalidExtras ? 'Corrigez les lignes supplémentaires invalides avant de facturer' : undefined}>
            {invoicing && <Loader2 size={14} className="animate-spin" />}
            {invoicing
              ? 'Facturation…'
              : `Facturer${apercu.count > 1 ? ` (${apercu.count})` : ''}`}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={invoicing}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Sous-composants ─────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border)] overflow-hidden">
      <div className="bg-[var(--bg-elevated)] px-4 py-2 text-[var(--fs-xs)] uppercase tracking-wide
        text-[var(--text-muted)] font-semibold">
        {title}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

function TotalRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-4 py-2.5
      ${highlight ? 'bg-[var(--brand-soft)]' : ''}`}>
      <span className={`text-[var(--fs-sm)] ${highlight ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
        {label}
      </span>
      <span className={`font-mono text-[var(--fs-sm)]
        ${highlight ? 'font-semibold text-[var(--text)]' : 'text-[var(--text)]'}`}>
        {value}
      </span>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  } catch { return iso }
}
