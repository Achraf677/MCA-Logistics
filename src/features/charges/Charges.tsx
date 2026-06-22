import { useState, useEffect, useCallback } from 'react'
import { CreditCard, Receipt, Euro, Wallet, Lock } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { SyncButton } from '../../shared/ui/SyncButton'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton, SkeletonTable } from '../../shared/ui/Skeleton'
import { TabActions } from '../../shared/ui/TabbedSection'
import { FacturePdfLink } from '../../shared/ui/FacturePdfLink'
import { DrawerCharge } from './DrawerCharge'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { getCharges, exportChargesCSV, syncPennylane, updateCharge } from './charges.queries'
import { getSyncState } from '../../shared/lib/syncState'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { formatCents, categoryColor, kpiSummary } from './charges.logic'
import { getCategories } from '../../shared/lib/categories.queries'
import { downloadCSV } from '../../shared/lib/download'
import type { ChargeRow, ChargeFilters } from './charges.types'
import type { ChargeCategoryRow } from '../../shared/types/categories'
import type { ActionKey } from '../../shared/actions/ActionBar'

export function Charges() {
  const { toast } = useToast()
  const { can } = usePermissions()
  const { companyId } = useProfile()
  const canCreate = can('finance.charges', 'create')
  const [rows, setRows]               = useState<ChargeRow[]>([])
  const [categories, setCategories]   = useState<ChargeCategoryRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [filters, setFilters]         = useState<ChargeFilters>({})
  const [drawerOpen, setDrawerOpen]   = useState(false)
  const [selected, setSelected]       = useState<ChargeRow | null>(null)
  const [lastSyncAt, setLastSyncAt]   = useState<string | null>(null)

  // Chargement des catégories (une fois par companyId)
  useEffect(() => {
    if (!companyId) return
    getCategories(companyId).then(setCategories)
  }, [companyId])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getCharges(filters)
    if (error) setError(error.message)
    else setRows((data ?? []) as unknown as ChargeRow[])
    setLoading(false)
  }, [filters])

  const fetchLastSync = useCallback(async () => {
    const ts = await getSyncState('pennylane_charges')
    setLastSyncAt(ts)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { fetchLastSync() }, [fetchLastSync])

  const handleAction = async (key: ActionKey) => {
    if (key === 'nouveau') { setSelected(null); setDrawerOpen(true) }
    if (key === 'export') {
      const csv = await exportChargesCSV(filters)
      downloadCSV(csv, 'charges.csv')
      toast('Export téléchargé')
    }
  }

  const handleCategoryChange = async (rowId: string, categoryId: string | null) => {
    const cat = categories.find(c => c.id === categoryId) ?? null
    setRows(prev => prev.map(r =>
      r.id === rowId ? { ...r, category_id: categoryId, charge_categories: cat } : r
    ))
    const { error } = await updateCharge(rowId, { category_id: categoryId })
    if (error) { toast(error.message, 'error'); load() }
  }

  // Seules les charges manuelles (sans pennylane_id) ouvrent le drawer d'édition
  const openRow = (row: ChargeRow) => {
    if (row.pennylane_id) return
    setSelected(row); setDrawerOpen(true)
  }

  const kpis = kpiSummary(rows)
  const hasFilters = !!(
    (filters.category_id && filters.category_id !== 'all') ||
    filters.date_from || filters.date_to
  )

  return (
    <Shell pageTitle="Charges" actions={[...(canCreate ? ['nouveau' as const] : []), 'export']} onAction={handleAction}>
      <TabActions>
        <SyncButton
          label="Synchroniser Pennylane"
          lastSyncAt={lastSyncAt}
          onSync={async () => {
            const { data, error } = await syncPennylane()
            if (error || data?.ok === false) {
              return { ok: false, message: error?.message ?? data?.error ?? 'Échec Pennylane' }
            }
            const n = data?.data?.charges_upserts ?? 0
            await load()
            await fetchLastSync()
            return { ok: true, message: n > 0 ? `${n} facture(s) synchronisée(s)` : 'Aucune nouvelle facture' }
          }}
        />
      </TabActions>

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5 mb-6 [&>*]:min-w-0">
          {[0,1,2].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5 mb-6 [&>*]:min-w-0">
          <KpiCard label="Charges"   value={kpis.nb} tone="info" icon={<Receipt size={18} />} />
          <KpiCard label="Total HT"  value={formatCents(kpis.totalHtCts)} tone="warning" icon={<Euro size={18} />} />
          <KpiCard label="Total TTC" value={formatCents(kpis.totalTtcCts)} tone="warning" icon={<Wallet size={18} />} />
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 mb-4 glass rounded-[var(--r-xl)] px-4 py-3">
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
          value={filters.category_id ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, category_id: (e.target.value || 'all') as ChargeFilters['category_id'] }))}
          className={filterCls}
        >
          <option value="all">Toutes catégories</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
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
          <div className="hidden md:block overflow-x-auto glass rounded-[var(--r-xl)]">
            <table className="w-full text-[var(--fs-sm)]">
              <thead>
                <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                  {['Date', 'Fournisseur', 'Libellé', 'Catégorie', 'Montant HT', 'TVA', 'Total TTC', 'Facture', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const isPennylane = !!row.pennylane_id
                  return (
                    <tr
                      key={row.id}
                      onClick={() => openRow(row)}
                      className={`border-t border-[var(--border)] transition-colors
                        ${isPennylane ? 'cursor-default' : 'cursor-pointer hover:bg-[var(--bg-card-hover)]'}
                        ${i % 2 === 0 ? '' : 'bg-[var(--bg-card)]/40'}`}
                    >
                      <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                        {new Date(row.date).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)] max-w-[140px] truncate">
                        {row.suppliers?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 max-w-[260px]">
                        <div className="flex items-center gap-2">
                          <span title={row.label} className="font-medium text-[var(--text)] truncate">{row.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <select
                          value={row.category_id ?? ''}
                          onChange={e => handleCategoryChange(row.id, e.target.value || null)}
                          className={categoryCls}
                        >
                          <option value="">Non catégorisé</option>
                          {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className={`px-4 py-3 font-mono ${row.montant_ht_cts < 0 ? 'text-[var(--loss)]' : ''}`}>
                        {formatCents(row.montant_ht_cts)}
                      </td>
                      <td className="px-4 py-3 font-mono">{row.tva_cts != null ? formatCents(row.tva_cts) : '—'}</td>
                      <td className={`px-4 py-3 font-mono font-semibold ${row.montant_ttc_cts != null && row.montant_ttc_cts < 0 ? 'text-[var(--loss)]' : 'text-[var(--text)]'}`}>
                        {row.montant_ttc_cts ? formatCents(row.montant_ttc_cts) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <FacturePdfLink pennylane_id={row.pennylane_id} receipt_url={row.receipt_url} />
                        {!row.receipt_url && !row.pennylane_id && <span className="text-[var(--text-disabled)]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isPennylane ? (
                          <span title="Géré dans Pennylane"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-[var(--r-sm)] text-[var(--text-disabled)]">
                            <Lock size={13} />
                          </span>
                        ) : (
                          <Button variant="ghost" size="compact" onClick={e => { e.stopPropagation(); openRow(row) }}>Voir</Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden flex flex-col gap-3">
            {rows.map(row => {
              const isPennylane = !!row.pennylane_id
              const cat = row.charge_categories
              return (
                <div
                  key={row.id}
                  onClick={() => openRow(row)}
                  className={`w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 transition-colors
                    ${isPennylane ? 'cursor-default' : 'cursor-pointer hover:bg-[var(--bg-card-hover)]'}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span title={row.label} className="font-medium text-[var(--text)] truncate">{row.label}</span>
                    <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                      {cat && <Badge color={categoryColor(cat.slug)}>{cat.name}</Badge>}
                      <select
                        value={row.category_id ?? ''}
                        onChange={e => handleCategoryChange(row.id, e.target.value || null)}
                        className={categoryCls}
                      >
                        <option value="">—</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="flex flex-col gap-0.5 text-[var(--fs-xs)] text-[var(--text-muted)]">
                      <span>{new Date(row.date).toLocaleDateString('fr-FR')}</span>
                      {row.suppliers?.name && <span>{row.suppliers.name}</span>}
                      {isPennylane && (
                        <span className="inline-flex items-center gap-1 text-[var(--text-disabled)]">
                          <Lock size={10} /> Géré dans Pennylane
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`font-mono font-semibold ${row.montant_ht_cts < 0 ? 'text-[var(--loss)]' : 'text-[var(--text)]'}`}>
                        {formatCents(row.montant_ht_cts)} HT
                      </span>
                      <FacturePdfLink
                        pennylane_id={row.pennylane_id}
                        receipt_url={row.receipt_url}
                        iconSize={10}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <DrawerCharge
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        charge={selected}
        onSaved={load}
        categories={categories}
      />
    </Shell>
  )
}

const filterCls = `h-8 px-3 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors`

const categoryCls = `h-7 px-2 rounded-[var(--r-sm)] bg-[var(--bg-elevated)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-xs)] focus:outline-none focus:border-[var(--brand)]
  transition-colors cursor-pointer max-w-[140px]`
