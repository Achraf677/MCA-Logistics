import { useState, useEffect, useCallback } from 'react'
import { CheckCheck, Euro, TrendingUp, Banknote } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton, SkeletonTable } from '../../shared/ui/Skeleton'
import { SyncButton } from '../../shared/ui/SyncButton'
import { useToast } from '../../shared/ui/useToast'
import { supabase } from '../../app/providers'
import { getEncaissements, checkPayments, exportEncaissementsCSV, getAutresEntrees } from './encaissement.queries'
import { formatCents, buildEntreesUnifiees, kpiSummaryUnifie, natureBadge } from './encaissement.logic'
import { downloadCSV } from '../../shared/lib/download'
import type { EntreeUnifiee, EncaissementFilters } from './encaissement.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

type ClientLookup = { id: string; label: string }

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR')
}

export function Encaissement() {
  const { toast } = useToast()
  const [entrees, setEntrees]   = useState<EntreeUnifiee[]>([])
  const [clients, setClients]   = useState<ClientLookup[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [filters, setFilters]   = useState<EncaissementFilters>({})

  useEffect(() => {
    supabase.from('clients').select('id, name').eq('active', true).order('name')
      .then(({ data }) => setClients((data ?? []).map(c => ({ id: c.id, label: c.name }))))
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const [enc, ae] = await Promise.all([
      getEncaissements(filters),
      getAutresEntrees({ date_from: filters.date_from, date_to: filters.date_to }),
    ])
    if (enc.error) { setError((enc.error as Error).message); setLoading(false); return }
    setEntrees(buildEntreesUnifiees(enc.data ?? [], ae.data ?? []))
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  const handleAction = async (key: ActionKey) => {
    if (key === 'export') {
      const csv = await exportEncaissementsCSV(filters)
      downloadCSV(csv, 'encaissements.csv')
      toast('Export téléchargé')
    }
  }

  const kpis = kpiSummaryUnifie(entrees)
  const hasFilters = !!(
    (filters.client_id && filters.client_id !== 'all') ||
    filters.date_from || filters.date_to
  )

  return (
    <Shell pageTitle="Encaissement" actions={['export']} onAction={handleAction}>
      <div className="flex flex-col gap-5">

        {/* Note + SyncButton */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-[var(--fs-xs)] text-[var(--text-muted)] flex-1">
            Le statut payé provient de Pennylane&nbsp;; les crédits Qonto (apports, remboursements) sont affichés hors CA.
          </p>
          <SyncButton
            label="Vérifier les paiements"
            icon={<CheckCheck size={13} />}
            onSync={async () => {
              const { data, error } = await checkPayments()
              if (error || data?.ok === false)
                return { ok: false, message: error?.message ?? data?.error ?? 'Échec de la vérification' }
              const marked = data?.data?.marked_payee ?? 0
              await load()
              return { ok: true, message: marked > 0 ? `${marked} livraison(s) marquée(s) payée(s)` : 'Aucun nouveau paiement détecté' }
            }}
          />
        </div>

        {/* KPIs */}
        {loading ? (
          <div className="grid grid-cols-2 gap-5 [&>*]:min-w-0">
            {[0, 1].map(i => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5 [&>*]:min-w-0">
            <KpiCard
              label="Encaissé clients"
              value={formatCents(kpis.totalClientsCts)}
              tone="success"
              icon={<Euro size={18} />}
            />
            <KpiCard
              label="Autres entrées"
              value={formatCents(kpis.totalAutresCts)}
              sub="hors chiffre d'affaires"
              tone="muted"
              icon={<TrendingUp size={18} />}
            />
          </div>
        )}

        {/* Filtres */}
        <div className="flex flex-wrap items-center gap-3 glass rounded-[var(--r-xl)] px-4 py-3">
          <input type="date" value={filters.date_from ?? ''}
            onChange={e => setFilters(f => ({ ...f, date_from: e.target.value || undefined }))}
            title="Date début" className={filterCls} />
          <input type="date" value={filters.date_to ?? ''}
            onChange={e => setFilters(f => ({ ...f, date_to: e.target.value || undefined }))}
            title="Date fin" className={filterCls} />
          <select value={filters.client_id ?? 'all'}
            onChange={e => setFilters(f => ({ ...f, client_id: e.target.value || 'all' }))}
            className={filterCls}>
            <option value="all">Tous clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          {hasFilters && (
            <Button variant="ghost" size="compact" onClick={() => setFilters({})}>Réinitialiser</Button>
          )}
        </div>

        {/* Table unifiée */}
        {loading ? (
          <SkeletonTable rows={6} />
        ) : error ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <p className="text-[var(--danger)] text-[var(--fs-sm)]">{error}</p>
            <Button variant="secondary" onClick={load}>Réessayer</Button>
          </div>
        ) : entrees.length === 0 ? (
          <EmptyState
            icon={<Banknote size={48} />}
            title="Aucune entrée d'argent"
            description={hasFilters
              ? 'Aucun résultat pour ces filtres.'
              : 'Les factures réglées (Pennylane) et les crédits Qonto apparaîtront ici.'}
          />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto glass rounded-[var(--r-xl)]">
              <table className="w-full text-[var(--fs-sm)]">
                <thead>
                  <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                    {['Date', 'Libellé', 'Montant', 'Nature'].map(h => (
                      <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {entrees.map(e => {
                    const badge = natureBadge(e.nature)
                    return (
                      <tr key={e.key} className="transition-colors hover:bg-[var(--bg-card-hover)]">
                        <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)] whitespace-nowrap">
                          {fmtDate(e.date)}
                        </td>
                        <td className="px-4 py-3 font-medium text-[var(--text)] max-w-xs truncate">
                          {e.libelle}
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-[var(--text)] whitespace-nowrap">
                          +{formatCents(e.montant_cts)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge color={badge.color}>{badge.label}</Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden flex flex-col gap-3">
              {entrees.map(e => {
                const badge = natureBadge(e.nature)
                return (
                  <div key={e.key} className="glass rounded-[var(--r-lg)] p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-medium text-[var(--text)] truncate flex-1">{e.libelle}</span>
                      <span className="font-mono font-semibold text-[var(--text)] whitespace-nowrap shrink-0">
                        +{formatCents(e.montant_cts)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[var(--fs-xs)] text-[var(--text-muted)]">
                      <span>{fmtDate(e.date)}</span>
                      <Badge color={badge.color}>{badge.label}</Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </Shell>
  )
}

const filterCls = `h-8 px-3 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors`
