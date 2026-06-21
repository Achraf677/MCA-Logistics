import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, AlertCircle, Clock, Euro } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton, SkeletonTable } from '../../shared/ui/Skeleton'
import { DrawerIncident } from './DrawerIncident'
import { getIncidents } from './incidents.queries'
import {
  TYPE_LABELS, TYPE_COLOR, STATUS_LABELS, STATUS_COLOR, formatCents, kpiSummary,
} from './incidents.logic'
import type { IncidentRow, IncidentFilters, IncidentType, IncidentStatus } from './incidents.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

export function Incidents() {
  const [rows, setRows]       = useState<IncidentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [filters, setFilters] = useState<IncidentFilters>({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<IncidentRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getIncidents(filters)
    if (error) setError((error as Error).message)
    else setRows((data as IncidentRow[]) ?? [])
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  const handleAction = (key: ActionKey) => {
    if (key === 'nouveau') { setSelected(null); setDrawerOpen(true) }
  }

  const openRow = (row: IncidentRow) => { setSelected(row); setDrawerOpen(true) }

  const kpis = kpiSummary(rows)
  const hasFilters = !!(
    (filters.type && filters.type !== 'all') ||
    (filters.status && filters.status !== 'all') ||
    filters.date_from || filters.date_to
  )

  return (
    <Shell pageTitle="Incidents" actions={['nouveau']} onAction={handleAction}>
      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-6 [&>*]:min-w-0">
          {[0,1,2,3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-6 [&>*]:min-w-0">
          <KpiCard label="Incidents"  value={kpis.nb} tone="info" icon={<AlertTriangle size={18} />} />
          <KpiCard label="Ouverts"    value={kpis.ouverts} tone={kpis.ouverts > 0 ? 'danger' : 'neutral'} icon={<AlertCircle size={18} />} />
          <KpiCard label="En cours"   value={kpis.enCours} tone="warning" icon={<Clock size={18} />} />
          <KpiCard label="Coût total" value={formatCents(kpis.totalDmg)} tone="warning" icon={<Euro size={18} />} />
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
        <select value={filters.type ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, type: (e.target.value || 'all') as IncidentFilters['type'] }))}
          className={filterCls}>
          <option value="all">Tous types</option>
          {(Object.entries(TYPE_LABELS) as [IncidentType, string][]).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        <select value={filters.status ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, status: (e.target.value || 'all') as IncidentFilters['status'] }))}
          className={filterCls}>
          <option value="all">Tous statuts</option>
          {(Object.entries(STATUS_LABELS) as [IncidentStatus, string][]).map(([k, l]) => (
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
          icon={<AlertTriangle size={48} />}
          title="Aucun incident"
          description={hasFilters ? 'Aucun résultat pour ces filtres.' : 'Enregistrez les incidents de votre flotte.'}
          action={!hasFilters ? { label: '+ Signaler un incident', onClick: () => { setSelected(null); setDrawerOpen(true) } } : undefined}
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto glass rounded-[var(--r-xl)]">
            <table className="w-full text-[var(--fs-sm)]">
              <thead>
                <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                  {['Date', 'Véhicule', 'Type', 'Description', 'Lieu', 'Dommages', 'Statut', ''].map(h => (
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
                    <td className="px-4 py-3 font-medium text-[var(--text)]">
                      {row.vehicles?.label ?? '—'}
                      {row.vehicles?.plate && (
                        <span className="ml-2 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">{row.vehicles.plate}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.type
                        ? <Badge color={TYPE_COLOR[row.type]}>{TYPE_LABELS[row.type]}</Badge>
                        : <span className="text-[var(--text-disabled)]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)] max-w-[180px] truncate">{row.description ?? '—'}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)] text-[var(--fs-xs)] truncate max-w-[120px]">{row.location ?? '—'}</td>
                    <td className="px-4 py-3 font-mono">{row.damage_cts != null ? formatCents(row.damage_cts) : '—'}</td>
                    <td className="px-4 py-3">
                      <Badge color={STATUS_COLOR[row.status]}>{STATUS_LABELS[row.status]}</Badge>
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
                  <span className="font-medium text-[var(--text)]">{row.vehicles?.label ?? '—'}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {row.type && <Badge color={TYPE_COLOR[row.type]}>{TYPE_LABELS[row.type]}</Badge>}
                    <Badge color={STATUS_COLOR[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                  </div>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="flex flex-col gap-0.5 text-[var(--fs-xs)] text-[var(--text-muted)]">
                    <span>{new Date(row.date).toLocaleDateString('fr-FR')}</span>
                    {row.description && <span className="truncate max-w-[200px]">{row.description}</span>}
                  </div>
                  <span className="font-mono font-semibold text-[var(--text)] shrink-0">
                    {row.damage_cts != null ? formatCents(row.damage_cts) : '—'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <DrawerIncident
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        incident={selected}
        onSaved={load}
      />
    </Shell>
  )
}

const filterCls = `h-8 px-3 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors`
