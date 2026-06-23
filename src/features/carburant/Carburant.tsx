import { useState, useEffect, useCallback } from 'react'
import { Fuel, Euro, Droplet, Gauge } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton, SkeletonTable } from '../../shared/ui/Skeleton'
import { DrawerCarburant } from './DrawerCarburant'
import { useToast } from '../../shared/ui/useToast'
import { supabase } from '../../app/providers'
import { getFuelLogs, exportFuelCSV } from './carburant.queries'
import {
  FUEL_TYPE_LABELS, FUEL_TYPE_COLOR,
  formatCents, formatLiters, formatPricePerLiter, kpiSummary,
} from './carburant.logic'
import { FacturePdfLink } from '../../shared/ui/FacturePdfLink'
import { downloadCSV } from '../../shared/lib/download'
import type { FuelLogRow, FuelFilters } from './carburant.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

type VehicleLookup = { id: string; label: string }

export function Carburant() {
  const { toast } = useToast()
  const [rows, setRows]         = useState<FuelLogRow[]>([])
  const [vehicles, setVehicles] = useState<VehicleLookup[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [filters, setFilters]   = useState<FuelFilters>({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<FuelLogRow | null>(null)

  useEffect(() => {
    supabase.from('vehicles').select('id, label').eq('status', 'active').order('label')
      .then(({ data }) => setVehicles((data ?? []).map(v => ({ id: v.id, label: v.label }))))
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getFuelLogs(filters)
    if (error) setError(error.message)
    else setRows((data ?? []) as unknown as FuelLogRow[])
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  const handleAction = async (key: ActionKey) => {
    if (key === 'nouveau') { setSelected(null); setDrawerOpen(true) }
    if (key === 'export') {
      const csv = await exportFuelCSV(filters)
      downloadCSV(csv, 'carburant.csv')
      toast('Export téléchargé')
    }
  }

  const openRow = (row: FuelLogRow) => { setSelected(row); setDrawerOpen(true) }

  const kpis = kpiSummary(rows)

  const hasFilters = !!(
    (filters.vehicle_id && filters.vehicle_id !== 'all') ||
    filters.date_from || filters.date_to
  )

  return (
    <Shell pageTitle="Carburant" actions={['nouveau', 'export']} onAction={handleAction}>
      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-6 [&>*]:min-w-0">
          {[0,1,2,3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-6 [&>*]:min-w-0">
          <KpiCard label="Plein(s)"      value={kpis.nb} tone="info" icon={<Fuel size={18} />} />
          <KpiCard label="Total TTC"     value={formatCents(kpis.totalCts)} tone="warning" icon={<Euro size={18} />} />
          <KpiCard label="Litres"        value={formatLiters(kpis.totalLiters)} tone="info" icon={<Droplet size={18} />} />
          <KpiCard label="Prix moy. / L" value={formatPricePerLiter(kpis.avgPricePerLiter)} tone="violet" icon={<Gauge size={18} />} />
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
          value={filters.vehicle_id ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, vehicle_id: (e.target.value || 'all') as FuelFilters['vehicle_id'] }))}
          className={filterCls}
        >
          <option value="all">Tous véhicules</option>
          {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
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
          icon={<Fuel size={48} />}
          title="Aucun plein enregistré"
          description={hasFilters
            ? 'Aucun résultat pour ces filtres.'
            : 'Commencez à enregistrer les pleins de carburant.'}
          action={!hasFilters
            ? { label: '+ Saisir un plein', onClick: () => { setSelected(null); setDrawerOpen(true) } }
            : undefined}
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto glass rounded-[var(--r-xl)]">
            <table className="w-full text-[var(--fs-sm)]">
              <thead>
                <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                  {['Date', 'Véhicule', 'Chauffeur', 'Litres', '€/L', 'Total TTC', 'Carburant', 'km', 'Facture', ''].map(h => (
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
                    <td className="px-4 py-3 font-medium text-[var(--text)]">
                      {row.vehicles?.label ?? '—'}
                      {row.vehicles?.plate && (
                        <span className="ml-2 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                          {row.vehicles.plate}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{row.team_members?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 font-mono">{row.liters.toFixed(2)} L</td>
                    <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                      {(row.price_per_liter_milli / 1000).toFixed(3)} €
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-[var(--text)]">
                      {formatCents(row.total_cts)}
                    </td>
                    <td className="px-4 py-3">
                      {row.fuel_type
                        ? <Badge color={FUEL_TYPE_COLOR[row.fuel_type]}>{FUEL_TYPE_LABELS[row.fuel_type]}</Badge>
                        : <span className="text-[var(--text-disabled)]">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">
                      {row.mileage_km != null ? `${row.mileage_km.toLocaleString('fr-FR')} km` : '—'}
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
                      ) : (
                        <span className="text-[var(--text-disabled)]">—</span>
                      )}
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
                  <span className="font-medium text-[var(--text)]">{row.vehicles?.label ?? '—'}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {row.charges && <Badge color="success">Facturé</Badge>}
                    {row.fuel_type && <Badge color={FUEL_TYPE_COLOR[row.fuel_type]}>{FUEL_TYPE_LABELS[row.fuel_type]}</Badge>}
                  </div>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="flex flex-col gap-0.5 text-[var(--fs-xs)] text-[var(--text-muted)]">
                    <span>{new Date(row.date).toLocaleDateString('fr-FR')}</span>
                    <span>{row.liters.toFixed(2)} L · {(row.price_per_liter_milli / 1000).toFixed(3)} €/L</span>
                    {row.station && <span>{row.station}</span>}
                  </div>
                  <span className="font-mono font-semibold text-[var(--text)]">{formatCents(row.total_cts)}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <DrawerCarburant
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        fuelLog={selected}
        onSaved={load}
      />
    </Shell>
  )
}

const filterCls = `h-8 px-3 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors`
