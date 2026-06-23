import { useState, useEffect, useCallback } from 'react'
import { Wallet, CheckCheck, Link2 } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { SyncButton } from '../../shared/ui/SyncButton'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton, SkeletonTable } from '../../shared/ui/Skeleton'
import { LinkedChargeCard } from '../../shared/ui/LinkedChargeCard'
import { SelecteurCharge } from '../../shared/ui/SelecteurCharge'
import { formatMoney } from '../../shared/lib/money'
import { getMatchingChargesForDebit, classifyDebit } from '../../shared/lib/rapprochementQonto'
import {
  getLatestSnapshot, getTransactions, syncQonto, checkPayments,
  getChargesForRapprochement, linkChargeToTransaction, unlinkChargeFromTransaction,
} from './tresorerie.queries'
import {
  amountColorClass, formatSignedAmount, operationTypeLabel, formatTxDate,
} from './tresorerie.logic'
import { useToast } from '../../shared/ui/useToast'
import type { TreasurySnapshot, QontoTx } from './tresorerie.types'
import type { ChargePick } from '../../shared/types/charges'

export function Tresorerie() {
  const { toast } = useToast()
  const [snapshot, setSnapshot]         = useState<TreasurySnapshot | null>(null)
  const [txs, setTxs]                   = useState<QontoTx[]>([])
  const [charges, setCharges]           = useState<ChargePick[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [rapprochOpen, setRapprochOpen] = useState<string | null>(null) // qonto_id ouvert

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [snapRes, txRes, chargesData] = await Promise.all([
      getLatestSnapshot(),
      getTransactions(),
      getChargesForRapprochement(),
    ])
    if (snapRes.error) setError(snapRes.error.message)
    else setSnapshot(snapRes.data ?? null)
    if (txRes.error) setError(txRes.error.message)
    else setTxs(txRes.data ?? [])
    setCharges(chargesData)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Dérivés rapprochement ──────────────────────────────────────────────────
  const linkedChargeIds = new Set(txs.filter(t => t.charge_id).map(t => t.charge_id!))
  const debits = txs.filter(t => t.side === 'debit')

  const debitsSansJustif = debits.filter(t => {
    const m = getMatchingChargesForDebit(t.amount_cts, charges, linkedChargeIds, t.settled_at)
    return classifyDebit(t.charge_id, m.length) === 'sans_justificatif'
  })
  const totalSansJustifCts = debitsSansJustif.reduce((s, t) => s + t.amount_cts, 0)

  const chargesSansDebit = charges.filter(
    c => (c.montant_ttc_cts ?? 0) > 0 && !linkedChargeIds.has(c.id)
  )

  // ── Handlers rapprochement ─────────────────────────────────────────────────
  const handleLink = async (charge: ChargePick) => {
    if (!rapprochOpen) return
    const { error } = await linkChargeToTransaction(rapprochOpen, charge.id)
    if (error) { toast(error.message, 'error'); return }
    setRapprochOpen(null)
    await load()
    toast('Rapprochement enregistré')
  }

  const handleDetach = async (qontoId: string) => {
    const { error } = await unlinkChargeFromTransaction(qontoId)
    if (error) { toast(error.message, 'error'); return }
    await load()
    toast('Rapprochement supprimé')
  }

  // Charges disponibles pour la transaction en cours de rapprochement
  const txEnCours = rapprochOpen ? txs.find(t => t.qonto_id === rapprochOpen) ?? null : null
  const chargesDisponibles: ChargePick[] = txEnCours
    ? getMatchingChargesForDebit(txEnCours.amount_cts, charges, linkedChargeIds, txEnCours.settled_at)
    : []

  return (
    <Shell pageTitle="Trésorerie">
      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5 mb-6 [&>*]:min-w-0">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5 mb-6 [&>*]:min-w-0">
          <KpiCard label="Solde actuel"   value={snapshot ? formatMoney(snapshot.balance_cts) : '—'} accent />
          <KpiCard label="Solde autorisé" value={snapshot ? formatMoney(snapshot.authorized_balance_cts) : '—'} />
          <KpiCard label="Transactions"   value={txs.length} />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-6">
        <SyncButton
          label="Synchroniser Qonto"
          variant="primary"
          lastSyncAt={snapshot?.fetched_at ?? null}
          onSync={async () => {
            const { data, error } = await syncQonto()
            if (error || data?.ok === false) {
              return { ok: false, message: error?.message ?? data?.error ?? 'Échec de la synchronisation Qonto' }
            }
            await load()
            return { ok: true, message: 'Solde mis à jour' }
          }}
        />
        <SyncButton
          label="Vérifier les paiements"
          icon={<CheckCheck size={13} />}
          onSync={async () => {
            const { data, error } = await checkPayments()
            if (error || data?.ok === false) {
              return { ok: false, message: error?.message ?? data?.error ?? 'Échec de la vérification des paiements' }
            }
            const marked = data?.data?.marked_payee ?? 0
            await load()
            return { ok: true, message: marked > 0 ? `${marked} livraison(s) marquée(s) payée(s)` : 'Aucun nouveau paiement détecté' }
          }}
        />
      </div>

      {/* ── Contrôle bancaire ───────────────────────────────────────────────── */}
      <div className="mb-6">
        <h3 className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
          Contrôle bancaire
        </h3>

        {/* Compteurs */}
        {loading ? (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 mb-4 [&>*]:min-w-0">
            <KpiCard
              label="Débits sans justificatif"
              value={debitsSansJustif.length > 0
                ? `${debitsSansJustif.length} · ${formatMoney(totalSansJustifCts)}`
                : '0'}
              tone={debitsSansJustif.length > 0 ? 'warning' : undefined}
            />
            <KpiCard
              label="Charges sans débit Qonto"
              value={chargesSansDebit.length}
              tone={chargesSansDebit.length > 0 ? 'info' : undefined}
            />
          </div>
        )}

        {/* Liste des débits */}
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : debits.length === 0 ? (
          <p className="text-[var(--fs-sm)] text-[var(--text-muted)] py-4 text-center">
            Aucun débit — synchronisez Qonto pour commencer.
          </p>
        ) : (
          <div className="glass rounded-[var(--r-xl)] overflow-hidden divide-y divide-[var(--border)]">
            {debits.map(tx => {
              const matches = getMatchingChargesForDebit(tx.amount_cts, charges, linkedChargeIds, tx.settled_at)
              const status  = classifyDebit(tx.charge_id, matches.length)
              const linked  = tx.charge_id ? charges.find(c => c.id === tx.charge_id) ?? null : null

              return (
                <div key={tx.qonto_id} className="px-4 py-3 flex flex-col gap-2">
                  {/* Ligne principale */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-[var(--fs-xs)] text-[var(--text-muted)] shrink-0 w-20">
                      {formatTxDate(tx.settled_at)}
                    </span>
                    <span className="flex-1 min-w-0 text-[var(--fs-sm)] font-medium text-[var(--text)] truncate">
                      {tx.label ?? '—'}
                    </span>
                    <span className="font-mono font-semibold text-[var(--fs-sm)] text-[var(--danger)] shrink-0">
                      −{formatMoney(tx.amount_cts)}
                    </span>
                    {status === 'sans_justificatif' && (
                      <Badge color="warning">Justificatif manquant</Badge>
                    )}
                    {status === 'a_rapprocher' && (
                      <Button
                        variant="secondary"
                        size="compact"
                        onClick={() => setRapprochOpen(tx.qonto_id)}
                      >
                        <Link2 size={12} />
                        Rapprocher ({matches.length})
                      </Button>
                    )}
                    {status === 'justifie' && (
                      <Badge color="success">Justifié</Badge>
                    )}
                  </div>

                  {/* Charge liée */}
                  {status === 'justifie' && linked && (
                    <LinkedChargeCard
                      charge={linked}
                      onDetach={() => handleDetach(tx.qonto_id)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Historique complet des transactions ─────────────────────────────── */}
      <h3 className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-3">
        Toutes les transactions
      </h3>

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

      {/* Sélecteur de rapprochement */}
      <SelecteurCharge
        open={rapprochOpen !== null}
        onClose={() => setRapprochOpen(null)}
        onSelect={handleLink}
        fetchCharges={() => Promise.resolve(chargesDisponibles)}
      />
    </Shell>
  )
}
