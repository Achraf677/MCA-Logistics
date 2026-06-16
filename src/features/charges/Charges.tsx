import { useState, useEffect, useCallback } from 'react'
import { CreditCard } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton, SkeletonTable } from '../../shared/ui/Skeleton'
import { DrawerCharge } from './DrawerCharge'
import { useToast } from '../../shared/ui/useToast'
import { getCharges, exportChargesCSV } from './charges.queries'
import { usePermissions } from '../../shared/permissions/usePermissions'
import {
  CATEGORY_LABELS, CATEGORY_COLOR, formatCents, kpiSummary,
} from './charges.logic'
import { downloadCSV } from '../../shared/lib/download'
import type { ChargeRow, ChargeFilters, ChargeCategory } from './charges.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

export function Charges() {
  const { toast } = useToast()
  const { can } = usePermissions()
  const canCreate = can('finance.charges', 'create')
  const [rows, setRows]       = useState<ChargeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [filters, setFilters] = useState<ChargeFilters>({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<ChargeRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getCharges(filters)
    if (error) setError(error.message)
    else setRows(data ?? [])
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  const handleAction = async (key: ActionKey) => {
    if (key === 'nouveau') { setSelected(null); setDrawerOpen(true) }
    if (key === 'export') {
      const csv = await exportChargesCSV(filters)
      downloadCSV(csv, 'charges.csv')
      toast('Export téléchargé')
    }
  }

  const openRow = (row: ChargeRow) => { setSelected(row); setDrawerOpen(true) }

  const kpis = kpiSummary(rows)
  const hasFilters = !!(
    (filters.category && filters.category !== 'all') ||
    filters.date_from || filters.date_to
  )

  return (
    <Shell pageTitle="Charges" actions={[...(canCreate ? ['nouveau' as const] : []), 'export']} onAction={handleAction}>
      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          {[0,1,2].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <KpiCard label="Charges"      value={kpis.nb} />
          <KpiCard label="Total HT"     value={formatCents(kpis.totalHtCts)} accent />
          <KpiCard label="Total TTC"    value={formatCents(kpis.totalTtcCts)} />
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="date" value={filters.date_from ?? ''}
          onChange={e => setFilters(f => ({ ...f, date_from: e.target.value || undefined }))}
          title="Date début" className={filterCls}
        />
        <input
          type="date" value={filters.date_to ?? ''}
          onChange={e => setFilters(f => ({ ...f, date_to: e.target.value || undefined }))}
          title="Date fin" className={filterCls}
        />
        <select
          value={filters.category ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, category: (e.target.value || 'all') as ChargeFilters['category'] }))}
          className={filterCls}
        >
          <option value="all">Toutes catégories</option>
          {(Object.entries(CATEGORY_LABELS) as [ChargeCategory, string][]).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        {hasFilters && (
          <Button variant="ghost" size="compact" onClick={() => setFilters({})}>
            Réinitialiser
          </Button>
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
          icon={<CreditCard size={48} />}
          title="Aucune charge"
          description={hasFilters
            ? 'Aucun résultat pour ces filtres.'
            : 'Commencez à saisir vos charges.'}
          action={!hasFilters && canCreate
            ? { label: '+ Nouvelle charge', onClick: () => { setSelected(null); setDrawerOpen(true) } }
            : undefined}
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border)]">
            <table className="w-full text-[var(--fs-sm)]">
              <thead>
                <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                  {['Date', 'Libellé', 'Catégorie', 'Fournisseur', 'Montant HT', 'TVA%', 'Total TTC', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    onClick={() => openRow(row)}
                    className={`border-t border-[var(--border)] cursor-pointer transition-colors hover:bg-[var(--bg-card-hover)]
                      ${i % 2 === 0 ? '' : 'bg-[var(--bg-card)]/40'}`}
                  >
                    <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                      {new Date(row.date).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--text)] max-w-[200px] truncate">{row.label}</td>
                    <td className="px-4 py-3">
                      {row.category
                        ? <Badge color={CATEGORY_COLOR[row.category]}>{CATEGORY_LABELS[row.category]}</Badge>
                        : <span className="text-[var(--text-disabled)]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{row.suppliers?.name ?? '—'}</td>
                    <td className="px-4 py-3 font-mono">{formatCents(row.montant_ht_cts)}</td>
                    <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">{row.tva_rate} %</td>
                    <td className="px-4 py-3 font-mono font-semibold text-[var(--text)]">
                      {row.montant_ttc_cts ? formatCents(row.montant_ttc_cts) : '—'}
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
              <button
                key={row.id}
                onClick={() => openRow(row)}
                className="w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-medium text-[var(--text)] truncate">{row.label}</span>
                  {row.category && <Badge color={CATEGORY_COLOR[row.category]}>{CATEGORY_LABELS[row.category]}</Badge>}
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="flex flex-col gap-0.5 text-[var(--fs-xs)] text-[var(--text-muted)]">
                    <span>{new Date(row.date).toLocaleDateString('fr-FR')}</span>
                    {row.suppliers?.name && <span>{row.suppliers.name}</span>}
                  </div>
                  <span className="font-mono font-semibold text-[var(--text)]">
                    {formatCents(row.montant_ht_cts)} HT
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <DrawerCharge
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        charge={selected}
        onSaved={load}
      />
    </Shell>
  )
}

const filterCls = `h-8 px-3 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors`
