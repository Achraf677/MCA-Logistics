import { useState, useEffect, useCallback, useMemo } from 'react'
import { CreditCard, Receipt, Euro, Wallet, RefreshCw, Lock, ExternalLink, Loader } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton, SkeletonTable } from '../../shared/ui/Skeleton'
import { TabActions } from '../../shared/ui/TabbedSection'
import { DrawerCharge } from './DrawerCharge'
import { useToast } from '../../shared/ui/useToast'
import { getCharges, exportChargesCSV, syncPennylane, updateCharge, getChargeFileUrl } from './charges.queries'
import { usePermissions } from '../../shared/permissions/usePermissions'
import {
  CHARGE_CATEGORIES, CATEGORY_LABELS, formatCents, kpiSummary,
} from './charges.logic'
import { downloadCSV } from '../../shared/lib/download'
import type { ChargeRow, ChargeFilters, ChargeCategory } from './charges.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

export function Charges() {
  const { toast } = useToast()
  const { can } = usePermissions()
  const canCreate = can('finance.charges', 'create')
  const [rows, setRows]           = useState<ChargeRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [filters, setFilters]     = useState<ChargeFilters>({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected]   = useState<ChargeRow | null>(null)
  const [syncPending, setSyncPending] = useState(false)
  const [openingPdf, setOpeningPdf]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getCharges(filters)
    if (error) setError(error.message)
    else setRows(data ?? [])
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  // Dernière synchro Pennylane = max(pennylane_synced_at) des lignes chargées
  const lastSync = useMemo(() => {
    return rows.reduce((max, r) => {
      if (!r.pennylane_synced_at) return max
      return (!max || r.pennylane_synced_at > max) ? r.pennylane_synced_at : max
    }, null as string | null)
  }, [rows])

  const handleAction = async (key: ActionKey) => {
    if (key === 'nouveau') { setSelected(null); setDrawerOpen(true) }
    if (key === 'export') {
      const csv = await exportChargesCSV(filters)
      downloadCSV(csv, 'charges.csv')
      toast('Export téléchargé')
    }
  }

  const handleSync = async () => {
    setSyncPending(true)
    const { data, error } = await syncPennylane()
    setSyncPending(false)
    if (error || data?.ok === false) {
      toast(error?.message ?? data?.error ?? 'Échec de la synchronisation Pennylane', 'error')
      return
    }
    const n = data?.data?.charges_upserts ?? 0
    await load()
    toast(n > 0 ? `${n} facture(s) synchronisée(s)` : 'Aucune nouvelle facture')
  }

  const handleCategoryChange = async (rowId: string, category: ChargeCategory | null) => {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, category } : r))
    const { error } = await updateCharge(rowId, { category })
    if (error) { toast(error.message, 'error'); load() }
  }

  const openPdf = async (e: React.MouseEvent, row: ChargeRow) => {
    e.stopPropagation()
    if (!row.receipt_url && !row.pennylane_id) return
    if (!row.pennylane_id) {
      window.open(row.receipt_url!, '_blank', 'noopener,noreferrer')
      return
    }
    setOpeningPdf(row.id)
    const { data, error } = await getChargeFileUrl(row.pennylane_id)
    setOpeningPdf(null)
    if (error || !data?.url) { toast('Impossible d\'accéder au PDF', 'error'); return }
    window.open(data.url, '_blank', 'noopener,noreferrer')
  }

  // Seules les charges manuelles (sans pennylane_id) ouvrent le drawer d'édition
  const openRow = (row: ChargeRow) => {
    if (row.pennylane_id) return
    setSelected(row); setDrawerOpen(true)
  }

  const kpis = kpiSummary(rows)
  const hasFilters = !!(
    (filters.category && filters.category !== 'all') ||
    filters.date_from || filters.date_to
  )

  return (
    <Shell pageTitle="Charges" actions={[...(canCreate ? ['nouveau' as const] : []), 'export']} onAction={handleAction}>
      {/* Bouton sync Pennylane dans le slot TabActions */}
      <TabActions>
        <div className="flex items-center gap-3">
          {lastSync && (
            <span className="text-[var(--fs-xs)] text-[var(--text-disabled)] hidden sm:inline">
              Synchro : {new Date(lastSync).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button variant="secondary" size="compact" onClick={handleSync} disabled={syncPending}>
            <RefreshCw size={13} className={syncPending ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Synchroniser Pennylane</span>
          </Button>
        </div>
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
                      <td className="px-4 py-3 max-w-[200px]">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[var(--text)] truncate">{row.label}</span>
                          {isPennylane && (
                            <Badge color="muted">Pennylane</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <select
                          value={row.category ?? ''}
                          onChange={e => handleCategoryChange(row.id, (e.target.value as ChargeCategory) || null)}
                          className={categoryCls}
                        >
                          <option value="">Non catégorisé</option>
                          {CHARGE_CATEGORIES.map(c => (
                            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 font-mono">{formatCents(row.montant_ht_cts)}</td>
                      <td className="px-4 py-3 font-mono">{row.tva_cts != null ? formatCents(row.tva_cts) : '—'}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-[var(--text)]">
                        {row.montant_ttc_cts ? formatCents(row.montant_ttc_cts) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {(row.receipt_url || row.pennylane_id) ? (
                          <button
                            onClick={e => openPdf(e, row)}
                            disabled={openingPdf === row.id}
                            className="inline-flex items-center gap-1 text-[var(--info)] hover:underline text-[var(--fs-xs)] disabled:opacity-50"
                          >
                            {openingPdf === row.id
                              ? <Loader size={11} className="animate-spin" />
                              : <ExternalLink size={11} />}
                            Facture
                          </button>
                        ) : (
                          <span className="text-[var(--text-disabled)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isPennylane ? (
                          <span
                            title="Géré dans Pennylane"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-[var(--r-sm)] text-[var(--text-disabled)]"
                          >
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
              return (
                <div
                  key={row.id}
                  onClick={() => openRow(row)}
                  className={`w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 transition-colors
                    ${isPennylane ? 'cursor-default' : 'cursor-pointer hover:bg-[var(--bg-card-hover)]'}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-medium text-[var(--text)] truncate">{row.label}</span>
                    <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                      {isPennylane && <Badge color="muted">Pennylane</Badge>}
                      <select
                        value={row.category ?? ''}
                        onChange={e => handleCategoryChange(row.id, (e.target.value as ChargeCategory) || null)}
                        className={categoryCls}
                      >
                        <option value="">Non catégorisé</option>
                        {CHARGE_CATEGORIES.map(c => (
                          <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
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
                      <span className="font-mono font-semibold text-[var(--text)]">
                        {formatCents(row.montant_ht_cts)} HT
                      </span>
                      {(row.receipt_url || row.pennylane_id) && (
                        <button
                          onClick={e => openPdf(e, row)}
                          disabled={openingPdf === row.id}
                          className="inline-flex items-center gap-1 text-[var(--info)] text-[var(--fs-xs)] disabled:opacity-50"
                        >
                          {openingPdf === row.id
                            ? <Loader size={10} className="animate-spin" />
                            : <ExternalLink size={10} />}
                          Facture
                        </button>
                      )}
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
      />
    </Shell>
  )
}

const filterCls = `h-8 px-3 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors`

const categoryCls = `h-7 px-2 rounded-[var(--r-sm)] bg-[var(--bg-elevated)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-xs)] focus:outline-none focus:border-[var(--brand)]
  transition-colors cursor-pointer max-w-[140px]`
