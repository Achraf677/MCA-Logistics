import { useState, useEffect, useCallback } from 'react'
import { Clock } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton, SkeletonTable } from '../../shared/ui/Skeleton'
import { DrawerHeure } from '../../shared/drawers/DrawerHeure'
import { supabase } from '../../app/providers'
import { getWorkHours } from './heures.queries'
import { formatMinutes, formatTime, kpiSummary } from './heures.logic'
import type { WorkHourRow, WorkHourFilters } from './heures.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

type MemberLookup = { id: string; label: string }

export function Heures() {
  const [rows, setRows]       = useState<WorkHourRow[]>([])
  const [members, setMembers] = useState<MemberLookup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [filters, setFilters] = useState<WorkHourFilters>({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<WorkHourRow | null>(null)

  useEffect(() => {
    supabase.from('team_members').select('id, full_name').eq('active', true).order('full_name')
      .then(({ data }) => setMembers((data ?? []).map(m => ({ id: m.id, label: m.full_name }))))
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getWorkHours(filters)
    if (error) setError((error as Error).message)
    else setRows((data as WorkHourRow[]) ?? [])
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  const handleAction = (key: ActionKey) => {
    if (key === 'nouveau') { setSelected(null); setDrawerOpen(true) }
  }

  const openRow = (row: WorkHourRow) => { setSelected(row); setDrawerOpen(true) }

  const kpis = kpiSummary(rows)
  const hasFilters = !!(
    (filters.member_id && filters.member_id !== 'all') ||
    filters.date_from || filters.date_to
  )

  return (
    <Shell pageTitle="Heures" actions={['nouveau']} onAction={handleAction}>
      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KpiCard label="Saisies" value={kpis.nb} />
          <KpiCard label="Heures totales" value={formatMinutes(kpis.totalMinutes)} accent />
          <KpiCard label="Chauffeurs" value={kpis.uniqueDrivers} />
          <KpiCard label="Avec livraison" value={kpis.withDelivery} />
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
        <select value={filters.member_id ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, member_id: e.target.value || 'all' }))}
          className={filterCls}>
          <option value="all">Tous chauffeurs</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
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
          icon={<Clock size={48} />}
          title="Aucune heure saisie"
          description={hasFilters ? 'Aucun résultat pour ces filtres.' : 'Commencez à saisir les heures travaillées.'}
          action={!hasFilters ? { label: '+ Saisir des heures', onClick: () => { setSelected(null); setDrawerOpen(true) } } : undefined}
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border)]">
            <table className="w-full text-[var(--fs-sm)]">
              <thead>
                <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                  {['Date', 'Chauffeur', 'Début', 'Fin', 'Pause', 'Total', 'Livraison', ''].map(h => (
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
                      {row.team_members?.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--fs-xs)]">{formatTime(row.start_time)}</td>
                    <td className="px-4 py-3 font-mono text-[var(--fs-xs)]">{formatTime(row.end_time)}</td>
                    <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                      {row.break_minutes > 0 ? `${row.break_minutes} min` : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-[var(--brand)]">
                      {formatMinutes(row.total_minutes)}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)] text-[var(--fs-xs)]">
                      {(row.deliveries as { clients: { name: string } | null } | null)?.clients?.name ?? '—'}
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
                  <span className="font-medium text-[var(--text)]">{row.team_members?.full_name ?? '—'}</span>
                  <span className="font-mono font-semibold text-[var(--brand)]">{formatMinutes(row.total_minutes)}</span>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="flex flex-col gap-0.5 text-[var(--fs-xs)] text-[var(--text-muted)]">
                    <span>{new Date(row.date).toLocaleDateString('fr-FR')}</span>
                    {row.start_time && row.end_time && (
                      <span>{formatTime(row.start_time)} → {formatTime(row.end_time)}</span>
                    )}
                  </div>
                  {row.break_minutes > 0 && (
                    <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">{row.break_minutes} min pause</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <DrawerHeure
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        workHour={selected}
        onSaved={load}
      />
    </Shell>
  )
}

const filterCls = `h-8 px-3 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors`
