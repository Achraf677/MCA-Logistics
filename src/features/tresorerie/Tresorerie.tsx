import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, Wallet, CheckCheck } from 'lucide-react'
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
  const [snapshot, setSnapshot]   = useState<TreasurySnapshot | null>(null)
  const [txs, setTxs]             = useState<QontoTx[]>([])
  const [charges, setCharges]     = useState<ChargePick[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [expandedTx, setExpandedTx]   = useState<string | null>(null)
  const [rapprochOpen, setRapprochOpen] = useState<string | null>(null)

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

  // ── Handlers ──────────────────────────────────────────────────────────────
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

  const toggleExpand = (qontoId: string) =>
    setExpandedTx(prev => prev === qontoId ? null : qontoId)

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

      {/* Sync */}
      <div className="flex flex-wrap gap-2 mb-4">
        <SyncButton
          label="Synchroniser Qonto"
          variant="primary"
          lastSyncAt={snapshot?.fetched_at ?? null}
          onSync={async () => {
            const { data, error } = await syncQonto()
            if (error || data?.ok === false)
              return { ok: false, message: error?.message ?? data?.error ?? 'Échec de la synchronisation Qonto' }
            await load()
            return { ok: true, message: 'Solde mis à jour' }
          }}
        />
        <SyncButton
          label="Vérifier les paiements"
          icon={<CheckCheck size={13} />}
          onSync={async () => {
            const { data, error } = await checkPayments()
            if (error || data?.ok === false)
              return { ok: false, message: error?.message ?? data?.error ?? 'Échec de la vérification des paiements' }
            const marked = data?.data?.marked_payee ?? 0
            await load()
            return { ok: true, message: marked > 0 ? `${marked} livraison(s) marquée(s) payée(s)` : 'Aucun nouveau paiement détecté' }
          }}
        />
      </div>

      {/* Stat discrète débits sans justificatif */}
      {!loading && debitsSansJustif.length > 0 && (
        <div className="flex items-center gap-2 mb-3 text-[var(--fs-xs)] text-[var(--text-muted)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--warn)] shrink-0" />
          <span>
            Débits sans justificatif : <strong className="text-[var(--text)]">{debitsSansJustif.length}</strong>
            <span className="mx-1">·</span>
            <strong className="text-[var(--text)]">{formatMoney(totalSansJustifCts)}</strong>
          </span>
        </div>
      )}

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
                  {['Date', 'Libellé', 'Type', 'Montant', 'État'].map(h => (
                    <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txs.map((tx, i) => {
                  const isDebit   = tx.side === 'debit'
                  const expanded  = expandedTx === tx.qonto_id
                  const matches   = isDebit
                    ? getMatchingChargesForDebit(tx.amount_cts, charges, linkedChargeIds, tx.settled_at)
                    : []
                  const status    = isDebit ? classifyDebit(tx.charge_id, matches.length) : null
                  const linked    = tx.charge_id ? charges.find(c => c.id === tx.charge_id) ?? null : null
                  const rowBg     = i % 2 === 0 ? '' : 'bg-[var(--bg-card)]/40'

                  return (
                    <>
                      <tr
                        key={tx.qonto_id}
                        onClick={isDebit ? () => toggleExpand(tx.qonto_id) : undefined}
                        className={`border-t border-[var(--border)] transition-colors
                          ${isDebit ? 'cursor-pointer hover:bg-[var(--bg-card-hover)]' : ''}
                          ${expanded ? 'bg-[var(--bg-elevated)]' : rowBg}`}
                      >
                        <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                          {formatTxDate(tx.settled_at)}
                        </td>
                        <td className="px-4 py-3 font-medium text-[var(--text)]">
                          <div className="flex items-center gap-2">
                            {isDebit && (
                              <ChevronDown
                                size={13}
                                className={`text-[var(--text-muted)] shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                              />
                            )}
                            {tx.label ?? '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge color="muted">{operationTypeLabel(tx.operation_type)}</Badge>
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-semibold ${amountColorClass(tx.side)}`}>
                          {formatSignedAmount(tx)}
                        </td>
                        <td className="px-4 py-3">
                          {status === 'justifie'            && <Badge color="success">Justifié</Badge>}
                          {status === 'a_rapprocher'        && <Badge color="info">À rapprocher</Badge>}
                          {status === 'sans_justificatif'   && <Badge color="warning">Justificatif manquant</Badge>}
                        </td>
                      </tr>

                      {/* Accordéon inline */}
                      {isDebit && expanded && (
                        <tr key={`${tx.qonto_id}-accordion`} className="border-t border-[var(--border)]">
                          <td colSpan={5} className="p-0">
                            <div className="px-6 py-4 bg-[var(--bg-elevated)] space-y-3">
                              {status === 'justifie' && linked && (
                                <LinkedChargeCard
                                  charge={linked}
                                  onDetach={() => handleDetach(tx.qonto_id)}
                                />
                              )}
                              {status === 'a_rapprocher' && (
                                <div className="flex items-center gap-3">
                                  <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                                    {matches.length} charge{matches.length > 1 ? 's' : ''} au même montant disponible{matches.length > 1 ? 's' : ''}
                                  </p>
                                  <Button
                                    variant="secondary"
                                    size="compact"
                                    onClick={e => { e.stopPropagation(); setRapprochOpen(tx.qonto_id) }}
                                  >
                                    Rapprocher
                                  </Button>
                                </div>
                              )}
                              {status === 'sans_justificatif' && (
                                <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                                  Aucune charge au montant TTC de {formatMoney(tx.amount_cts)} sur la période. Vérifiez dans Charges.
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden flex flex-col gap-3">
            {txs.map(tx => {
              const isDebit  = tx.side === 'debit'
              const expanded = expandedTx === tx.qonto_id
              const matches  = isDebit
                ? getMatchingChargesForDebit(tx.amount_cts, charges, linkedChargeIds, tx.settled_at)
                : []
              const status   = isDebit ? classifyDebit(tx.charge_id, matches.length) : null
              const linked   = tx.charge_id ? charges.find(c => c.id === tx.charge_id) ?? null : null

              return (
                <div
                  key={tx.qonto_id}
                  className="bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] overflow-hidden"
                >
                  <div
                    onClick={isDebit ? () => toggleExpand(tx.qonto_id) : undefined}
                    className={`p-4 ${isDebit ? 'cursor-pointer' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isDebit && (
                          <ChevronDown
                            size={13}
                            className={`text-[var(--text-muted)] shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                          />
                        )}
                        <span className="font-medium text-[var(--text)] truncate">{tx.label ?? '—'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge color="muted">{operationTypeLabel(tx.operation_type)}</Badge>
                        {status === 'justifie'          && <Badge color="success">Justifié</Badge>}
                        {status === 'a_rapprocher'      && <Badge color="info">À rapprocher</Badge>}
                        {status === 'sans_justificatif' && <Badge color="warning">Manquant</Badge>}
                      </div>
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">{formatTxDate(tx.settled_at)}</span>
                      <span className={`font-mono font-semibold ${amountColorClass(tx.side)}`}>
                        {formatSignedAmount(tx)}
                      </span>
                    </div>
                  </div>

                  {/* Accordéon mobile */}
                  {isDebit && expanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-[var(--border)] bg-[var(--bg-elevated)] space-y-3 pt-3">
                      {status === 'justifie' && linked && (
                        <LinkedChargeCard charge={linked} onDetach={() => handleDetach(tx.qonto_id)} />
                      )}
                      {status === 'a_rapprocher' && (
                        <div className="flex items-center gap-3">
                          <p className="text-[var(--fs-xs)] text-[var(--text-muted)] flex-1">
                            {matches.length} charge{matches.length > 1 ? 's' : ''} disponible{matches.length > 1 ? 's' : ''}
                          </p>
                          <Button
                            variant="secondary"
                            size="compact"
                            onClick={() => setRapprochOpen(tx.qonto_id)}
                          >
                            Rapprocher
                          </Button>
                        </div>
                      )}
                      {status === 'sans_justificatif' && (
                        <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                          Aucune charge au montant TTC de {formatMoney(tx.amount_cts)}.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
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
