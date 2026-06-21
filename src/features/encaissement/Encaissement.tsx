import { useState, useEffect, useCallback } from 'react'
import { Banknote, CreditCard, Euro } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton, SkeletonTable } from '../../shared/ui/Skeleton'
import { DrawerEncaissement } from './DrawerEncaissement'
import { useToast } from '../../shared/ui/useToast'
import { supabase } from '../../app/providers'
import { getPayments, exportPaymentsCSV } from './encaissement.queries'
import { METHOD_LABELS, METHOD_COLOR, formatCents, kpiSummary } from './encaissement.logic'
import { downloadCSV } from '../../shared/lib/download'
import type { PaymentRow, PaymentFilters, PaymentMethod } from './encaissement.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

type ClientLookup = { id: string; label: string }

export function Encaissement() {
  const { toast } = useToast()
  const [rows, setRows]       = useState<PaymentRow[]>([])
  const [clients, setClients] = useState<ClientLookup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [filters, setFilters] = useState<PaymentFilters>({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<PaymentRow | null>(null)

  useEffect(() => {
    supabase.from('clients').select('id, name').eq('active', true).order('name')
      .then(({ data }) => setClients((data ?? []).map(c => ({ id: c.id, label: c.name }))))
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getPayments(filters)
    if (error) setError((error as Error).message)
    else setRows((data as PaymentRow[]) ?? [])
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  const handleAction = async (key: ActionKey) => {
    if (key === 'nouveau') { setSelected(null); setDrawerOpen(true) }
    if (key === 'export') {
      const csv = await exportPaymentsCSV(filters)
      downloadCSV(csv, 'encaissements.csv')
      toast('Export téléchargé')
    }
  }

  const openRow = (row: PaymentRow) => { setSelected(row); setDrawerOpen(true) }

  const kpis = kpiSummary(rows)
  const hasFilters = !!(
    (filters.method && filters.method !== 'all') ||
    (filters.client_id && filters.client_id !== 'all') ||
    filters.date_from || filters.date_to
  )

  return (
    <Shell pageTitle="Encaissement" actions={['nouveau', 'export']} onAction={handleAction}>
      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5 mb-6 [&>*]:min-w-0">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5 mb-6 [&>*]:min-w-0">
          <KpiCard label="Paiements"      value={kpis.nb} tone="info" icon={<CreditCard size={18} />} />
          <KpiCard label="Total encaissé" value={formatCents(kpis.totalCts)} tone="success" icon={<Euro size={18} />} />
          <KpiCard label="Virements"      value={formatCents(kpis.byMethod['virement'] ?? 0)} tone="info" icon={<Banknote size={18} />} />
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 mb-4 glass rounded-[var(--r-xl)] px-4 py-3">
        <input type="date" value={filters.date_from ?? ''}
          onChange={e => setFilters(f => ({ ...f, date_from: e.target.value || undefined }))}
          title="Date début" className={filterCls} />
        <input type="date" value={filters.date_to ?? ''}
          onChange={e => setFilters(f => ({ ...f, date_to: e.target.value || undefined }))}
          title="Date fin" className={filterCls} />
        <select value={filters.method ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, method: (e.target.value || 'all') as PaymentFilters['method'] }))}
          className={filterCls}>
          <option value="all">Tous modes</option>
          {(Object.entries(METHOD_LABELS) as [PaymentMethod, string][]).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
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

      {/* Contenu */}
      {loading ? (
        <SkeletonTable rows={6} />
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-[var(--danger)] text-[var(--fs-sm)]">{error}</p>
          <Button variant="secondary" onClick={load}>Réessayer</Button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Banknote size={48} />}
          title="Aucun encaissement"
          description={hasFilters ? 'Aucun résultat pour ces filtres.' : 'Enregistrez vos premiers paiements clients.'}
          action={!hasFilters ? { label: '+ Saisir un paiement', onClick: () => { setSelected(null); setDrawerOpen(true) } } : undefined}
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto glass rounded-[var(--r-xl)]">
            <table className="w-full text-[var(--fs-sm)]">
              <thead>
                <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                  {['Date', 'Client', 'Montant', 'Mode', 'Référence', 'Livraison liée', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id} onClick={() => openRow(row)}
                    className={`border-t border-[var(--border)] cursor-pointer transition-colors hover:bg-[var(--bg-card-hover)]
                      ${i % 2 === 0 ? '' : 'bg-[var(--bg-card)]/40'}`}>
                    <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                      {new Date(row.date).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--text)]">{row.clients?.name ?? '—'}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-[var(--text)]">
                      {formatCents(row.amount_cts)}
                    </td>
                    <td className="px-4 py-3">
                      {row.method
                        ? <Badge color={METHOD_COLOR[row.method]}>{METHOD_LABELS[row.method]}</Badge>
                        : <span className="text-[var(--text-disabled)]">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                      {row.reference ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)] text-[var(--fs-xs)]">
                      {row.deliveries
                        ? new Date(row.deliveries.date).toLocaleDateString('fr-FR')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="compact" onClick={e => { e.stopPropagation(); openRow(row) }}>Voir</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden flex flex-col gap-3">
            {rows.map(row => (
              <button key={row.id} onClick={() => openRow(row)}
                className="w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-medium text-[var(--text)]">{row.clients?.name ?? '—'}</span>
                  {row.method && <Badge color={METHOD_COLOR[row.method]}>{METHOD_LABELS[row.method]}</Badge>}
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="flex flex-col gap-0.5 text-[var(--fs-xs)] text-[var(--text-muted)]">
                    <span>{new Date(row.date).toLocaleDateString('fr-FR')}</span>
                    {row.reference && <span>{row.reference}</span>}
                  </div>
                  <span className="font-mono font-semibold text-[var(--text)]">{formatCents(row.amount_cts)}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <DrawerEncaissement
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        payment={selected}
        onSaved={load}
      />
    </Shell>
  )
}

const filterCls = `h-8 px-3 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors`
