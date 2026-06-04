import { useState, useEffect, useCallback } from 'react'
import { Package } from 'lucide-react'
import { Shell }       from '../../app/Shell'
import { KpiCard }     from '../../shared/ui/KpiCard'
import { Badge }       from '../../shared/ui/Badge'
import { Button }      from '../../shared/ui/Button'
import { EmptyState }  from '../../shared/ui/EmptyState'
import { Skeleton, SkeletonTable } from '../../shared/ui/Skeleton'
import { DrawerLivraison } from './DrawerLivraison'
import { useToast }    from '../../shared/ui/useToast'
import { downloadCSV } from '../../shared/lib/download'
import { getDeliveries, exportDeliveriesCSV } from './livraisons.queries'
import {
  STATUS_LABELS, STATUS_COLORS, TYPE_LABELS,
  kpiSummary, formatCents, effectiveTtcCts,
} from './livraisons.logic'
import type { DeliveryRow, DeliveryFilters, DeliveryStatus } from './livraisons.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

const V2_STATUSES: DeliveryStatus[] = ['planifiee', 'en_cours', 'livree', 'facturee', 'payee', 'annulee']

export function Livraisons() {
  const { toast } = useToast()
  const [rows, setRows]         = useState<DeliveryRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [filters, setFilters]   = useState<DeliveryFilters>({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<DeliveryRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: err } = await getDeliveries(filters)
    if (err) setError(err.message)
    else setRows((data as unknown as DeliveryRow[]) ?? [])
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  const handleAction = async (key: ActionKey) => {
    if (key === 'nouveau') { setSelected(null); setDrawerOpen(true) }
    if (key === 'export') {
      const csv = await exportDeliveriesCSV(filters)
      downloadCSV(csv, 'livraisons.csv')
      toast('Export téléchargé')
    }
  }

  const openRow = (row: DeliveryRow) => { setSelected(row); setDrawerOpen(true) }

  const hasFilters = !!(
    filters.date_from || filters.date_to ||
    (filters.status && filters.status !== 'all')
  )

  const kpis = kpiSummary(rows)

  return (
    <Shell pageTitle="Livraisons" actions={['nouveau', 'export']} onAction={handleAction}>

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[0,1,2,3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KpiCard label="Ce mois"     value={kpis.nbMois} />
          <KpiCard label="CA facturé"  value={formatCents(kpis.caFactureCts)} accent />
          <KpiCard label="À facturer"  value={kpis.enAttenteFacturation} />
          <KpiCard label="En att. paiement" value={formatCents(kpis.enAttentePaiementCts)} />
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input type="date" value={filters.date_from ?? ''}
          onChange={e => setFilters(f => ({ ...f, date_from: e.target.value || undefined }))}
          title="Date début" className={filterCls} />
        <input type="date" value={filters.date_to ?? ''}
          onChange={e => setFilters(f => ({ ...f, date_to: e.target.value || undefined }))}
          title="Date fin" className={filterCls} />
        <select
          value={filters.status ?? 'all'}
          onChange={e => setFilters(f => ({
            ...f, status: (e.target.value || 'all') as DeliveryFilters['status'],
          }))}
          className={filterCls}
        >
          <option value="all">Tous statuts</option>
          {V2_STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        {hasFilters && (
          <Button variant="ghost" size="compact" onClick={() => setFilters({})}>
            Réinitialiser
          </Button>
        )}
      </div>

      {/* Contenu principal */}
      {loading ? (
        <SkeletonTable rows={6} />
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-[var(--danger)] text-[var(--fs-sm)]">{error}</p>
          <Button variant="secondary" onClick={load}>Réessayer</Button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Package size={48} />}
          title="Aucune livraison"
          description={hasFilters
            ? 'Aucune livraison ne correspond aux filtres.'
            : 'Commencez par saisir votre première course.'}
          action={!hasFilters
            ? { label: '+ Nouvelle livraison', onClick: () => { setSelected(null); setDrawerOpen(true) } }
            : undefined}
        />
      ) : (
        <>
          {/* Desktop : tableau */}
          <div className="hidden md:block overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border)]">
            <table className="w-full text-[var(--fs-sm)]">
              <thead>
                <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                  {['Date', 'Client', 'Chauffeur', 'Montant TTC', 'km', 'Statut', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id} onClick={() => openRow(row)}
                    className={`border-t border-[var(--border)] cursor-pointer transition-colors
                      hover:bg-[var(--bg-card-hover)]
                      ${i % 2 === 0 ? 'bg-[var(--bg)]' : 'bg-[var(--bg-card)]/40'}`}
                  >
                    <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                      {new Date(row.date).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--text)]">
                      {row.clients?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {row.team_members?.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--text)]">
                      {effectiveTtcCts(row) > 0 ? formatCents(effectiveTtcCts(row)) : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                      {row.km != null ? `${row.km} km` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={STATUS_COLORS[row.statut] ?? 'muted'}>
                        {STATUS_LABELS[row.statut] ?? row.statut}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="compact"
                        onClick={e => { e.stopPropagation(); openRow(row) }}>
                        Voir
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile : cartes */}
          <div className="md:hidden flex flex-col gap-3">
            {rows.map(row => (
              <button key={row.id} onClick={() => openRow(row)}
                className="w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)]
                  border border-[var(--border)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-medium text-[var(--text)]">{row.clients?.name ?? '—'}</span>
                  <Badge color={STATUS_COLORS[row.statut] ?? 'muted'}>
                    {STATUS_LABELS[row.statut] ?? row.statut}
                  </Badge>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="flex flex-col gap-0.5 text-[var(--fs-xs)] text-[var(--text-muted)]">
                    <span>{new Date(row.date).toLocaleDateString('fr-FR')}</span>
                    {row.team_members?.full_name && <span>{row.team_members.full_name}</span>}
                    {row.type && <span>{TYPE_LABELS[row.type] ?? row.type}</span>}
                  </div>
                  <span className="font-mono font-semibold text-[var(--text)]">
                    {effectiveTtcCts(row) > 0 ? formatCents(effectiveTtcCts(row)) : '—'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <DrawerLivraison
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        delivery={selected}
        onSaved={load}
      />
    </Shell>
  )
}

const filterCls = `h-8 px-3 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors`
