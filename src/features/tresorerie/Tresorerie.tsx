import { useState, useEffect, useCallback, useMemo } from 'react'
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { GroupeMois } from '../../shared/ui/GroupeMois'
import { Skeleton, SkeletonTable } from '../../shared/ui/Skeleton'
import { formatMoney } from '../../shared/lib/money'
import { grouperParMois, moisOuvertParDefaut } from '../../shared/lib/mois'
import { useSync } from '../../app/SyncProvider'
import { getLatestSnapshot, getTransactions } from './tresorerie.queries'
import {
  amountColorClass, filtrerMouvements, formatSignedAmount, formatTxDate, operationTypeLabel, totauxMouvements,
  type FiltreSens,
} from './tresorerie.logic'
import type { TreasurySnapshot, QontoTx } from './tresorerie.types'

const SENS: Array<{ cle: FiltreSens; libelle: string }> = [
  { cle: 'tous', libelle: 'Tous' },
  { cle: 'entrees', libelle: 'Entrées' },
  { cle: 'sorties', libelle: 'Sorties' },
]

/**
 * Trésorerie : le solde Qonto et le relevé, mois par mois (lecture seule). Plus de rapprochement par ligne
 * (décision du 22/10/2026) : les justificatifs se gèrent dans Charges.
 */
export function Tresorerie() {
  const [snapshot, setSnapshot] = useState<TreasurySnapshot | null>(null)
  const [txs, setTxs] = useState<QontoTx[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sens, setSens] = useState<FiltreSens>('tous')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [snapRes, txRes] = await Promise.all([getLatestSnapshot(), getTransactions()])
    if (snapRes.error) setError(snapRes.error.message)
    else setSnapshot(snapRes.data ?? null)
    if (txRes.error) setError(txRes.error.message)
    else setTxs(txRes.data ?? [])
    setLoading(false)
  }, [])

  const { syncState, syncIfStale } = useSync()
  useEffect(() => { syncIfStale('qonto'); syncIfStale('paiements') }, [syncIfStale])
  useEffect(() => { void load() }, [load, syncState.qonto.lastSyncAt, syncState.paiements.lastSyncAt])

  const visibles = useMemo(() => filtrerMouvements(txs, sens, q), [txs, sens, q])
  const groupes = useMemo(() => grouperParMois(visibles, t => t.settled_at), [visibles])
  const ouvert = useMemo(() => moisOuvertParDefaut(groupes.map(g => g.cle), new Date()), [groupes])
  const moisCourant = groupes.find(g => g.cle === ouvert)
  const totauxMois = useMemo(() => totauxMouvements(moisCourant?.rows ?? []), [moisCourant])
  const recherche = q.trim() !== '' || sens !== 'tous'

  return (
    <Shell pageTitle="Trésorerie">
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6 [&>*]:min-w-0">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6 stagger [&>*]:min-w-0">
          <KpiCard label="Solde actuel" value={snapshot ? formatMoney(snapshot.balance_cts) : '—'} accent />
          <KpiCard label="Solde autorisé" value={snapshot ? formatMoney(snapshot.authorized_balance_cts) : '—'} />
          <KpiCard label={`Entrées${moisCourant ? ` · ${moisCourant.libelle.split(' ')[0].toLowerCase()}` : ''}`}
            value={formatMoney(totauxMois.entreesCts)} tone="success" icon={<ArrowDownLeft size={18} />} />
          <KpiCard label={`Sorties${moisCourant ? ` · ${moisCourant.libelle.split(' ')[0].toLowerCase()}` : ''}`}
            value={formatMoney(totauxMois.sortiesCts)} tone="danger" icon={<ArrowUpRight size={18} />} />
        </div>
      )}

      {!loading && txs.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <BarreRecherche value={q} onChange={setQ} placeholder="Chercher un mouvement : libellé, type d'opération…" ariaLabel="Rechercher un mouvement"
            raccourci className="flex-1 min-w-[12rem] max-w-xl" compteur={`${visibles.length} sur ${txs.length}`} />
          <div role="group" aria-label="Sens" className="inline-flex rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-card)] p-0.5">
            {SENS.map(s => (
              <button key={s.cle} type="button" aria-pressed={sens === s.cle} onClick={() => setSens(s.cle)}
                className={`px-3 py-1.5 rounded-[var(--r-sm)] text-xs font-semibold ${sens === s.cle ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
                {s.libelle}
              </button>
            ))}
          </div>
          {recherche && <span className="text-xs text-[var(--text-muted)]">{visibles.length} sur {txs.length} mouvements</span>}
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={6} />
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-[var(--danger)] text-sm">{error}</p>
          <Button variant="secondary" onClick={() => void load()}>Réessayer</Button>
        </div>
      ) : txs.length === 0 ? (
        <EmptyState icon={<Wallet size={48} />} title="Aucune donnée" description="Aucune donnée — clique sur Synchroniser Qonto." />
      ) : visibles.length === 0 ? (
        <EmptyState icon={<Wallet size={48} />} title="Aucun mouvement" description="Aucun mouvement ne correspond à ces filtres." />
      ) : (
        <div className="flex flex-col gap-3">
          {groupes.map(g => {
            const t = totauxMouvements(g.rows)
            return (
              <GroupeMois key={`${g.cle}-${recherche}`} titre={g.libelle} ouvertDefaut={recherche || g.cle === ouvert}
                resume={<>
                  <span>{g.rows.length} mouvement{g.rows.length > 1 ? 's' : ''}</span>
                  <span className="text-[var(--success)]">+{formatMoney(t.entreesCts)}</span>
                  <span className="text-[var(--danger)]">−{formatMoney(t.sortiesCts)}</span>
                </>}>
                <ul className="divide-y divide-[var(--border)]">
                  {g.rows.map(tx => (
                    <li key={tx.qonto_id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-16 shrink-0 font-mono text-xs text-[var(--text-muted)]">{formatTxDate(tx.settled_at).slice(0, 5)}</span>
                      <span className="flex-1 min-w-0 truncate font-medium text-[var(--text)]" title={tx.label ?? ''}>{tx.label ?? '—'}</span>
                      <span className="hidden sm:block shrink-0"><Badge color="muted">{operationTypeLabel(tx.operation_type)}</Badge></span>
                      <span className={`shrink-0 font-mono font-semibold tabular-nums ${amountColorClass(tx.side)}`}>{formatSignedAmount(tx)}</span>
                    </li>
                  ))}
                </ul>
              </GroupeMois>
            )
          })}
        </div>
      )}
    </Shell>
  )
}
