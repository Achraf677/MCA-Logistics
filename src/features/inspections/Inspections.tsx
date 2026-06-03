import { useState, useEffect, useCallback } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton, SkeletonTable } from '../../shared/ui/Skeleton'
import { DrawerInspection } from './DrawerInspection'
import { supabase } from '../../app/providers'
import { getInspections } from './inspections.queries'
import {
  TYPE_LABELS, STATUS_LABELS, STATUS_COLOR, countDefects, kpiSummary,
} from './inspections.logic'
import type { InspectionRow, InspectionFilters, InspectionType, InspectionStatus } from './inspections.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

type VehicleLookup = { id: string; label: string }

export function Inspections() {
  const [rows, setRows]         = useState<InspectionRow[]>([])
  const [vehicles, setVehicles] = useState<VehicleLookup[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [filters, setFilters]   = useState<InspectionFilters>({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<InspectionRow | null>(null)

  useEffect(() => {
    supabase.from('vehicles').select('id, label').order('label')
      .then(({ data }) => setVehicles((data ?? []).map(v => ({ id: v.id, label: v.label }))))
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getInspections(filters)
    if (error) setError((error as Error).message)
    else setRows((data as InspectionRow[]) ?? [])
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  const handleAction = (key: ActionKey) => {
    if (key === 'nouveau') { setSelected(null); setDrawerOpen(true) }
  }

  const openRow = (row: InspectionRow) => { setSelected(row); setDrawerOpen(true) }

  const kpis = kpiSummary(rows)
  const hasFilters = !!(
    (filters.vehicle_id && filters.vehicle_id !== 'all') ||
    (filters.status && filters.status !== 'all') ||
    (filters.type && filters.type !== 'all') ||
    filters.date_from || filters.date_to
  )

  return (
    <Shell pageTitle="Inspections" actions={['nouveau']} onAction={handleAction}>
      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[0,1,2,3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KpiCard label="Inspections" value={kpis.nb} />
          <KpiCard label="Conformes" value={kpis.ok} accent={kpis.ok === kpis.nb && kpis.nb > 0} />
          <KpiCard label="Avec défauts" value={kpis.defauts} accent={kpis.defauts > 0} />
          <KpiCard label="Refusées" value={kpis.refuses} accent={kpis.refuses > 0} />
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
          onChange={e => setFilters(f => ({ ...f, vehicle_id: e.target.value || 'all' }))}
          className={filterCls}>
          <option value="all">Tous véhicules</option>
          {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        <select value={filters.type ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, type: (e.target.value || 'all') as InspectionFilters['type'] }))}
          className={filterCls}>
          <option value="all">Tous types</option>
          {(Object.entries(TYPE_LABELS) as [InspectionType, string][]).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        <select value={filters.status ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, status: (e.target.value || 'all') as InspectionFilters['status'] }))}
          className={filterCls}>
          <option value="all">Tous statuts</option>
          {(Object.entries(STATUS_LABELS) as [InspectionStatus, string][]).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        {hasFilters && (
          <Button variant="ghost" size="compact" onClick={() => setFilters({})}>Réinitialiser</Button>
        )}
      </div>

      {/* Contenu */}
      {loading ? (
        <SkeletonTable rows={5} />
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <p className="text-[var(--danger)] text-[var(--fs-sm)]">{error}</p>
          <Button variant="secondary" onClick={load}>Réessayer</Button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck size={48} />}
          title="Aucune inspection"
          description={hasFilters ? 'Aucun résultat pour ces filtres.' : 'Commencez à enregistrer les inspections véhicules.'}
          action={!hasFilters ? { label: '+ Nouvelle inspection', onClick: () => { setSelected(null); setDrawerOpen(true) } } : undefined}
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border)]">
            <table className="w-full text-[var(--fs-sm)]">
              <thead>
                <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                  {['Date', 'Véhicule', 'Chauffeur', 'Type', 'Points NOK', 'Défauts', 'Statut', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const nok = countDefects(row)
                  return (
                    <tr key={row.id} onClick={() => openRow(row)}
                      className={`border-t border-[var(--border)] cursor-pointer transition-colors hover:bg-[var(--bg-card-hover)]
                        ${i % 2 === 0 ? '' : 'bg-[var(--bg-card)]/40'}`}>
                      <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                        {new Date(row.date).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        {row.vehicles?.label ?? '—'}
                        {row.vehicles?.plate && (
                          <span className="ml-2 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">{row.vehicles.plate}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{row.team_members?.full_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        {row.type
                          ? <Badge color="muted">{TYPE_LABELS[row.type]}</Badge>
                          : <span className="text-[var(--text-disabled)]">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-center">
                        {nok > 0
                          ? <span className="text-[var(--warning)] font-semibold">{nok}/7</span>
                          : <span className="text-[var(--success)]">0/7</span>}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)] text-[var(--fs-xs)] max-w-[150px] truncate">
                        {row.defects ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge color={STATUS_COLOR[row.status]}>{STATUS_LABELS[row.status]}</Badge>
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
              const nok = countDefects(row)
              return (
                <button key={row.id} onClick={() => openRow(row)}
                  className="w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="font-medium text-[var(--text)]">{row.vehicles?.label ?? '—'}</span>
                      {row.vehicles?.plate && (
                        <span className="ml-2 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">{row.vehicles.plate}</span>
                      )}
                    </div>
                    <Badge color={STATUS_COLOR[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="flex flex-col gap-0.5 text-[var(--fs-xs)] text-[var(--text-muted)]">
                      <span>{new Date(row.date).toLocaleDateString('fr-FR')}</span>
                      {row.team_members?.full_name && <span>{row.team_members.full_name}</span>}
                      {row.type && <span>{TYPE_LABELS[row.type]}</span>}
                    </div>
                    <span className={`font-mono text-[var(--fs-sm)] font-semibold ${nok > 0 ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
                      {nok} NOK
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      <DrawerInspection
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        inspection={selected}
        onSaved={load}
      />
    </Shell>
  )
}

const filterCls = `h-8 px-3 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors`
