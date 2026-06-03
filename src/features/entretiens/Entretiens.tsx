import { useState, useEffect, useCallback } from 'react'
import { Wrench, AlertTriangle } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton, SkeletonTable } from '../../shared/ui/Skeleton'
import { DrawerEntretien } from './DrawerEntretien'
import { supabase } from '../../app/providers'
import { getMaintenances } from './entretiens.queries'
import {
  MAINTENANCE_TYPE_LABELS, MAINTENANCE_TYPE_COLOR, formatCents, formatMileage, kpiSummary,
} from './entretiens.logic'
import type { MaintenanceRow, MaintenanceFilters, MaintenanceType } from './entretiens.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

type VehicleLookup = { id: string; label: string }

export function Entretiens() {
  const [rows, setRows]         = useState<MaintenanceRow[]>([])
  const [vehicles, setVehicles] = useState<VehicleLookup[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [filters, setFilters]   = useState<MaintenanceFilters>({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<MaintenanceRow | null>(null)

  useEffect(() => {
    supabase.from('vehicles').select('id, label').order('label')
      .then(({ data }) => setVehicles((data ?? []).map(v => ({ id: v.id, label: v.label }))))
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getMaintenances(filters)
    if (error) setError(error.message)
    else setRows(data ?? [])
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  const handleAction = (key: ActionKey) => {
    if (key === 'nouveau') { setSelected(null); setDrawerOpen(true) }
  }

  const openRow = (row: MaintenanceRow) => { setSelected(row); setDrawerOpen(true) }

  const kpis = kpiSummary(rows)
  const hasFilters = !!(
    (filters.vehicle_id && filters.vehicle_id !== 'all') ||
    (filters.type && filters.type !== 'all') ||
    filters.date_from || filters.date_to
  )

  return (
    <Shell pageTitle="Entretiens" actions={['nouveau']} onAction={handleAction}>
      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[0,1,2,3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KpiCard label="Opérations"    value={kpis.nb} />
          <KpiCard label="Coût total"    value={formatCents(kpis.totalCostCts)} accent />
          <KpiCard label="Avec échéance" value={kpis.withNextDue} />
          <KpiCard label="Échéances dépassées" value={kpis.overdue}
            accent={kpis.overdue > 0} />
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
        <select value={filters.vehicle_id ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, vehicle_id: (e.target.value || 'all') as MaintenanceFilters['vehicle_id'] }))}
          className={filterCls}>
          <option value="all">Tous véhicules</option>
          {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        <select value={filters.type ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, type: (e.target.value || 'all') as MaintenanceFilters['type'] }))}
          className={filterCls}>
          <option value="all">Tous types</option>
          {(Object.entries(MAINTENANCE_TYPE_LABELS) as [MaintenanceType, string][]).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
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
          icon={<Wrench size={48} />}
          title="Aucun entretien"
          description={hasFilters ? 'Aucun résultat pour ces filtres.' : 'Commencez à enregistrer les entretiens.'}
          action={!hasFilters
            ? { label: '+ Nouvel entretien', onClick: () => { setSelected(null); setDrawerOpen(true) } }
            : undefined}
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border)]">
            <table className="w-full text-[var(--fs-sm)]">
              <thead>
                <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                  {['Date', 'Véhicule', 'Type', 'Description', 'Coût', 'km', 'Prochaine éch.', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const isOverdue = row.next_due_date != null && row.next_due_date < new Date().toISOString().slice(0, 10)
                  return (
                    <tr
                      key={row.id}
                      onClick={() => openRow(row)}
                      className={`border-t border-[var(--border)] cursor-pointer transition-colors hover:bg-[var(--bg-card-hover)]
                        ${i % 2 === 0 ? '' : 'bg-[var(--bg-card)]/40'}`}
                    >
                      <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                        {new Date(row.date).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        {row.vehicles?.label ?? '—'}
                        {row.vehicles?.plate && (
                          <span className="ml-2 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                            {row.vehicles.plate}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.type
                          ? <Badge color={MAINTENANCE_TYPE_COLOR[row.type]}>{MAINTENANCE_TYPE_LABELS[row.type]}</Badge>
                          : <span className="text-[var(--text-disabled)]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)] max-w-[180px] truncate">
                        {row.description ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {row.cost_cts != null ? formatCents(row.cost_cts) : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                        {row.mileage_km != null ? formatMileage(row.mileage_km) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {row.next_due_date ? (
                          <span className={`flex items-center gap-1 text-[var(--fs-xs)] font-mono
                            ${isOverdue ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'}`}>
                            {isOverdue && <AlertTriangle size={11} />}
                            {new Date(row.next_due_date).toLocaleDateString('fr-FR')}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="compact" onClick={e => { e.stopPropagation(); openRow(row) }}>Voir</Button>
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
              const isOverdue = row.next_due_date != null && row.next_due_date < new Date().toISOString().slice(0, 10)
              return (
                <button
                  key={row.id}
                  onClick={() => openRow(row)}
                  className="w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-medium text-[var(--text)]">{row.vehicles?.label ?? '—'}</span>
                    {row.type && <Badge color={MAINTENANCE_TYPE_COLOR[row.type]}>{MAINTENANCE_TYPE_LABELS[row.type]}</Badge>}
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="flex flex-col gap-0.5 text-[var(--fs-xs)] text-[var(--text-muted)]">
                      <span>{new Date(row.date).toLocaleDateString('fr-FR')}</span>
                      {row.description && <span className="truncate max-w-[200px]">{row.description}</span>}
                      {row.next_due_date && (
                        <span className={isOverdue ? 'text-[var(--danger)]' : ''}>
                          Éch. {new Date(row.next_due_date).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </div>
                    <span className="font-mono font-semibold text-[var(--text)]">
                      {row.cost_cts != null ? formatCents(row.cost_cts) : '—'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      <DrawerEntretien
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        maintenance={selected}
        onSaved={load}
      />
    </Shell>
  )
}

const filterCls = `h-8 px-3 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors`
