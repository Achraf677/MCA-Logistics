import { useState, useEffect, useCallback } from 'react'
import { Wrench, AlertTriangle, Euro, Calendar } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton, SkeletonTable } from '../../shared/ui/Skeleton'
import { FacturePdfLink } from '../../shared/ui/FacturePdfLink'
import { DrawerEntretien } from './DrawerEntretien'
import { supabase } from '../../app/providers'
import { getMaintenances } from './entretiens.queries'
import { listAllocationsForCharges, type AllocationRow } from '../../shared/lib/allocations.queries'
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
  // Sous-lignes de ventilation "pure" par charge_id — remplace l'affichage du
  // montant brut quand la facture liée a été décomposée (voir DrawerEntretien).
  const [ventilationByCharge, setVentilationByCharge] = useState<Map<string, AllocationRow[]>>(new Map())

  useEffect(() => {
    supabase.from('vehicles').select('id, label').order('label')
      .then(({ data }) => setVehicles((data ?? []).map(v => ({ id: v.id, label: v.label }))))
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getMaintenances(filters)
    if (error) { setError(error.message); setLoading(false); return }
    const maintenanceRows = (data ?? []) as unknown as MaintenanceRow[]
    setRows(maintenanceRows)
    setLoading(false)

    const chargeIds = maintenanceRows.map(r => r.charges?.id).filter((id): id is string => !!id)
    const { data: ventilation } = await listAllocationsForCharges(chargeIds)
    const byCharge = new Map<string, AllocationRow[]>()
    for (const l of ventilation ?? []) {
      const arr = byCharge.get(l.charge_id) ?? []
      arr.push(l)
      byCharge.set(l.charge_id, arr)
    }
    setVentilationByCharge(byCharge)
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-6 [&>*]:min-w-0">
          {[0,1,2,3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-6 [&>*]:min-w-0">
          <KpiCard label="Opérations"          value={kpis.nb} tone="info" icon={<Wrench size={18} />} />
          <KpiCard label="Coût total"          value={formatCents(kpis.totalCostCts)} tone="warning" icon={<Euro size={18} />} />
          <KpiCard label="Avec échéance"       value={kpis.withNextDue} tone="info" icon={<Calendar size={18} />} />
          <KpiCard label="Échéances dépassées" value={kpis.overdue} tone={kpis.overdue > 0 ? 'danger' : 'neutral'} icon={<AlertTriangle size={18} />} />
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
          <div className="hidden md:block overflow-x-auto glass rounded-[var(--r-xl)]">
            <table className="w-full text-[var(--fs-sm)]">
              <thead>
                <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                  {['Date', 'Véhicule', 'Type', 'Description', 'Coût', 'km', 'Prochaine éch.', 'Facture', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const isOverdue = row.next_due_date != null && row.next_due_date < new Date().toISOString().slice(0, 10)
                  const ventilation = row.charges ? ventilationByCharge.get(row.charges.id) : undefined
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
                        {ventilation && ventilation.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {ventilation.map(l => (
                              <div key={l.id} className="flex items-center gap-1.5 text-[var(--fs-xs)]">
                                <span className="text-[var(--text-muted)] truncate max-w-[100px]">
                                  {l.charge_categories?.name ?? l.note ?? 'Sans catégorie'}
                                </span>
                                <span className="text-[var(--text)]">{formatCents(l.amount_cts)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          row.cost_cts != null ? formatCents(row.cost_cts) : '—'
                        )}
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
                      <td className="px-4 py-3">
                        {row.charges ? (
                          <div className="flex items-center gap-2">
                            <Badge color="success">Facturé</Badge>
                            <FacturePdfLink
                              pennylane_id={row.charges.pennylane_id}
                              receipt_url={row.charges.receipt_url}
                              label=""
                              iconSize={13}
                              className="inline-flex items-center text-[var(--brand)] hover:opacity-80 disabled:opacity-50"
                            />
                          </div>
                        ) : <span className="text-[var(--text-disabled)]">—</span>}
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
              const ventilation = row.charges ? ventilationByCharge.get(row.charges.id) : undefined
              return (
                <button
                  key={row.id}
                  onClick={() => openRow(row)}
                  className="w-full text-left bg-[var(--bg-card)] rounded-[var(--r-lg)] border border-[var(--border)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-medium text-[var(--text)]">{row.vehicles?.label ?? '—'}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {row.charges && <Badge color="success">Facturé</Badge>}
                      {row.type && <Badge color={MAINTENANCE_TYPE_COLOR[row.type]}>{MAINTENANCE_TYPE_LABELS[row.type]}</Badge>}
                    </div>
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
                    <div className="flex flex-col items-end gap-1">
                      {ventilation && ventilation.length > 0 ? (
                        ventilation.map(l => (
                          <span key={l.id} className="text-[var(--fs-xs)] text-[var(--text)]">
                            {l.charge_categories?.name ?? l.note ?? 'Sans catégorie'} · {formatCents(l.amount_cts)}
                          </span>
                        ))
                      ) : (
                        <span className="font-mono font-semibold text-[var(--text)]">
                          {row.cost_cts != null ? formatCents(row.cost_cts) : '—'}
                        </span>
                      )}
                      <FacturePdfLink
                        pennylane_id={row.charges?.pennylane_id}
                        receipt_url={row.charges?.receipt_url}
                        label=""
                        iconSize={12}
                        className="inline-flex items-center text-[var(--brand)] hover:opacity-80 disabled:opacity-50"
                      />
                    </div>
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
