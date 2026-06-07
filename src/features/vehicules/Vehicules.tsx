import { useState, useEffect, useCallback } from 'react'
import { Car, AlertTriangle } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { KpiCard } from '../../shared/ui/KpiCard'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SkeletonCards, SkeletonKpis } from '../../shared/ui/Skeleton'
import { DrawerVehicule } from './DrawerVehicule'
import { getVehicles } from './vehicules.queries'
import {
  STATUS_LABELS, STATUS_COLORS, FUEL_LABELS, getCritairClass, formatMileage,
  vehicleEcheances, worstStatus,
} from './vehicules.logic'
import type { Vehicle, VehicleFilters } from './vehicules.types'
import type { EcheanceStatus } from '../../shared/lib/echeances'
import type { ActionKey } from '../../shared/actions/ActionBar'

const PASTILLE_STYLES: Record<EcheanceStatus, string | null> = {
  ok:      'bg-[var(--success)]',
  soon:    'bg-[var(--warning)]',
  overdue: 'bg-[var(--danger)]',
  none:    null,
}

function EcheancePastille({ status }: { status: EcheanceStatus }) {
  const style = PASTILLE_STYLES[status]
  if (!style) return null
  const title = status === 'ok' ? 'Échéances OK' : status === 'soon' ? 'Échéance proche' : 'Échéance dépassée'
  return (
    <span
      title={title}
      className={`inline-block w-2.5 h-2.5 rounded-full ${style}`}
    />
  )
}

export function Vehicules() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<VehicleFilters>({})
  const today = new Date()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected] = useState<Vehicle | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error } = await getVehicles(filters)
    if (error) setError(error.message)
    else setVehicles(data ?? [])
    setLoading(false)
  }, [filters])

  useEffect(() => { load() }, [load])

  const openDrawer = (v?: Vehicle) => {
    setSelected(v ?? null)
    setDrawerOpen(true)
  }

  const handleAction = (key: ActionKey) => {
    if (key === 'nouveau') openDrawer()
  }

  const actifs = vehicles.filter(v => v.status === 'active').length
  const kmTotal = vehicles.reduce((sum, v) => sum + v.mileage_km, 0)
  const echeancesUrgentes = vehicles.filter(v => {
    const ws = worstStatus(vehicleEcheances(v, today))
    return ws === 'overdue' || ws === 'soon'
  }).length

  const displayedVehicles = filters.echeance === 'urgent'
    ? vehicles.filter(v => {
        const ws = worstStatus(vehicleEcheances(v, today))
        return ws === 'overdue' || ws === 'soon'
      })
    : vehicles

  return (
    <Shell pageTitle="Véhicules" actions={['nouveau', 'export']} onAction={handleAction}>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {loading ? <SkeletonKpis count={4} /> : <>
          <KpiCard label="Véhicules actifs" value={actifs} sub={`${vehicles.length} au total`} />
          <KpiCard label="Km total flotte" value={formatMileage(kmTotal)} />
          <KpiCard label="En maintenance" value={vehicles.filter(v => v.status === 'maintenance').length} />
          <KpiCard label="Échéances < 30 j" value={echeancesUrgentes} accent={echeancesUrgentes > 0} />
        </>}
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-6">
        <select
          value={filters.status ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, status: (e.target.value || 'all') as VehicleFilters['status'] }))}
          className="h-8 px-2 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text)] text-[var(--fs-sm)] focus:outline-none"
        >
          <option value="all">Tous statuts</option>
          {(Object.entries(STATUS_LABELS) as [string, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select
          value={filters.fuel_type ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, fuel_type: (e.target.value || 'all') as VehicleFilters['fuel_type'] }))}
          className="h-8 px-2 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text)] text-[var(--fs-sm)] focus:outline-none"
        >
          <option value="all">Tous carburants</option>
          {(Object.entries(FUEL_LABELS) as [string, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select
          value={filters.echeance ?? 'all'}
          onChange={e => setFilters(f => ({ ...f, echeance: (e.target.value || 'all') as VehicleFilters['echeance'] }))}
          className="h-8 px-2 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text)] text-[var(--fs-sm)] focus:outline-none"
        >
          <option value="all">Toutes échéances</option>
          <option value="urgent">Proche / dépassée</option>
        </select>
      </div>

      {loading ? <SkeletonCards rows={3} />
        : error ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <p className="text-[var(--danger)] text-[var(--fs-sm)]">{error}</p>
            <Button variant="secondary" onClick={load}>Réessayer</Button>
          </div>
        ) : vehicles.length === 0 ? (
          <EmptyState
            icon={<Car size={48} />}
            title="Aucun véhicule"
            description="Ajoutez les véhicules de votre flotte."
            action={{ label: '+ Ajouter un véhicule', onClick: () => openDrawer() }}
          />
        ) : (
          /* Vue garage — cartes (desktop ET mobile) */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedVehicles.map(v => (
              <button
                key={v.id}
                onClick={() => openDrawer(v)}
                className="text-left bg-[var(--bg-card)] rounded-[var(--r-xl)] border border-[var(--border)] p-5 hover:bg-[var(--bg-card-hover)] hover:border-[var(--brand)]/30 transition-all group"
              >
                {/* En-tête carte */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-display font-semibold text-[var(--text)] group-hover:text-[var(--brand)] transition-colors">
                      {v.label}
                    </p>
                    <p className="font-mono text-[var(--fs-xs)] text-[var(--text-muted)] mt-0.5">{v.plate}</p>
                  </div>
                  <Badge color={STATUS_COLORS[v.status] as 'success' | 'warning' | 'muted'}>
                    {STATUS_LABELS[v.status]}
                  </Badge>
                </div>

                {/* Infos */}
                <div className="flex flex-col gap-1.5 text-[var(--fs-sm)] text-[var(--text-muted)]">
                  {(v.brand || v.model) && (
                    <span>{[v.brand, v.model, v.year].filter(Boolean).join(' ')}</span>
                  )}
                  <span>{formatMileage(v.mileage_km)}</span>
                  {v.fuel_type && <span>{FUEL_LABELS[v.fuel_type]}</span>}
                </div>

                {/* Badges bas */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[var(--border-soft)]">
                  {v.critair && (
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[var(--fs-xs)] font-bold ${getCritairClass(v.critair)}`}>
                      {v.critair}
                    </span>
                  )}
                  {v.status === 'maintenance' && (
                    <span className="flex items-center gap-1 text-[var(--warning)] text-[var(--fs-xs)]">
                      <AlertTriangle size={12} /> En maintenance
                    </span>
                  )}
                  <EcheancePastille status={worstStatus(vehicleEcheances(v, today))} />
                </div>
              </button>
            ))}
          </div>
        )}

      <DrawerVehicule
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        vehicle={selected}
        onSaved={load}
      />
    </Shell>
  )
}
