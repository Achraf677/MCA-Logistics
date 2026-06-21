import { useState, useEffect, useCallback } from 'react'
import { Wallet, RefreshCw, CheckCheck } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton, SkeletonTable } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { formatMoney } from '../../shared/lib/money'
import { getLatestSnapshot, getTransactions, syncQonto, checkPayments } from './tresorerie.queries'
import {
  amountColorClass, formatSignedAmount, operationTypeLabel,
  formatSnapshotDate, formatTxDate,
} from './tresorerie.logic'
import type { TreasurySnapshot, QontoTx } from './tresorerie.types'

export function Tresorerie() {
  const { toast } = useToast()
  const [snapshot, setSnapshot] = useState<TreasurySnapshot | null>(null)
  const [txs, setTxs]           = useState<QontoTx[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [pending, setPending]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [snapRes, txRes] = await Promise.all([getLatestSnapshot(), getTransactions()])
    if (snapRes.error) setError(snapRes.error.message)
    else setSnapshot(snapRes.data ?? null)
    if (txRes.error) setError(txRes.error.message)
    else setTxs(txRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSync = async () => {
    setPending(true)
    const { data, error } = await syncQonto()
    if (error || data?.ok === false) {
      toast(error?.message ?? data?.error ?? 'Échec de la synchronisation Qonto', 'error')
      setPending(false)
      return
    }
    await load()
    setPending(false)
    toast('Solde mis à jour')
  }

  const handleCheckPayments = async () => {
    setPending(true)
    const { data, error } = await checkPayments()
    if (error || data?.ok === false) {
      toast(error?.message ?? data?.error ?? 'Échec de la vérification des paiements', 'error')
      setPending(false)
      return
    }
    const marked = data?.data?.marked_payee ?? 0
    await load()
    setPending(false)
    toast(marked > 0
      ? `${marked} livraison(s) marquée(s) payée(s)`
      : 'Aucun nouveau paiement détecté')
  }

  return (
    <Shell pageTitle="Trésorerie">
      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-6 [&>*]:min-w-0">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-6 [&>*]:min-w-0">
          <KpiCard label="Solde actuel"     value={snapshot ? formatMoney(snapshot.balance_cts) : '—'} accent />
          <KpiCard label="Solde autorisé"   value={snapshot ? formatMoney(snapshot.authorized_balance_cts) : '—'} />
          <KpiCard label="Dernière synchro" value={formatSnapshotDate(snapshot?.fetched_at ?? null)} />
          <KpiCard label="Transactions"     value={txs.length} />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 mb-4 glass rounded-[var(--r-xl)] px-4 py-3">
        <Button variant="primary" onClick={handleSync} disabled={pending}>
          <RefreshCw size={14} className={pending ? 'animate-spin' : ''} />
          Synchroniser Qonto
        </Button>
        <Button variant="secondary" onClick={handleCheckPayments} disabled={pending}>
          <CheckCheck size={14} />
          Vérifier les paiements
        </Button>
      </div>

      {/* Contenu */}
      {loading ? (
        <SkeletonTable rows={6} />
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-[var(--danger)] text-[var(--fs-sm)]">{error}</p>
          <Button variant="secondary" onClick={load}>Réessayer</Button>
        </div>
      ) : txs.length === 0 ? (
        <EmptyState
          icon={<Wallet size={48} />}
          title="Aucune donnée"
          description="Aucune donnée — clique sur Synchroniser Qonto."
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto glass rounded-[var(--r-xl)]">
            <table className="w-full text-[var(--fs-sm)]">
              <thead>
                <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                  {['Date', 'Libellé', 'Type', 'Montant'].map(h => (
                    <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txs.map((tx, i) => (
                  <tr
                    key={tx.qonto_id}
                    className={`border-t border-[var(--border)] ${i % 2 === 0 ? '' : 'bg-[var(--bg-card)]/40'}`}
                  >
                    <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                      {formatTxDate(tx.settled_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--text)]">{tx.label ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge color="muted">{operationTypeLabel(tx.operation_type)}</Badge>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${amountColorClass(tx.side)}`}>
                      {formatSignedAmount(tx)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden flex flex-col gap-3">
            {txs.map(tx => (
              <div
                key={tx.qonto_id}
                className="bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-4"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-medium text-[var(--text)]">{tx.label ?? '—'}</span>
                  <Badge color="muted">{operationTypeLabel(tx.operation_type)}</Badge>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">{formatTxDate(tx.settled_at)}</span>
                  <span className={`font-mono font-semibold ${amountColorClass(tx.side)}`}>
                    {formatSignedAmount(tx)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Shell>
  )
}
