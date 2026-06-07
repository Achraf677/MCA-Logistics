import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { Route, Clock, MapPin, AlertTriangle } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { toLocalISO } from '../../shared/lib/dates'
import {
  getCompanyDepot, getActiveVehicles, getActiveDrivers,
  fetchPlannableDeliveries, getDeliveriesForDate, fetchToursByDate,
  dispatchAndOptimize,
} from './tournees.queries'
import {
  isGeocoded, canDispatch, groupToursWithStops, totalsAcrossTours,
} from './tournees.logic'
import { TourCard, formatDuration } from './TourCard'
import { colorForIndex } from './tours.palette'
import type { OverviewTour } from './ToursOverviewMap'
import type { Tour, TourDelivery, Assignment, Lookup } from './tournees.types'

// Lazy-load : Leaflet hors bundle initial (chunk séparé).
const ToursOverviewMap = lazy(() => import('./ToursOverviewMap'))

export function Tournees() {
  const { companyId } = useProfile()
  const { toast } = useToast()

  const [date, setDate] = useState(toLocalISO(new Date()))

  const [vehicles, setVehicles] = useState<Lookup[]>([])
  const [drivers, setDrivers]   = useState<Lookup[]>([])
  const [depot, setDepot] = useState<{ lat: number | null; lng: number | null; name: string }>(
    { lat: null, lng: null, name: '' },
  )

  // Affectations : véhicules cochés + chauffeur par véhicule.
  const [selectedVehicles, setSelectedVehicles] = useState<Set<string>>(new Set())
  const [driverByVehicle, setDriverByVehicle]   = useState<Record<string, string>>({})

  const [pool, setPool]                 = useState<TourDelivery[]>([])   // livraisons 'planifiee'
  const [allDeliveries, setAllDeliveries] = useState<TourDelivery[]>([]) // pour les arrêts des tournées
  const [tours, setTours]               = useState<Tour[]>([])
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set())

  const [loadingList, setLoadingList] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const [unassignedCount, setUnassignedCount] = useState(0)

  // ── Référentiels (une fois) ─────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return
    getCompanyDepot(companyId).then(({ data }) => {
      if (data) setDepot({ lat: data.depot_lat, lng: data.depot_lng, name: data.name })
    })
    getActiveVehicles().then(({ data }) =>
      setVehicles((data ?? []).map(v => ({ id: v.id, label: v.label }))))
    getActiveDrivers().then(({ data }) =>
      setDrivers((data ?? []).map(d => ({ id: d.id, label: d.full_name }))))
  }, [companyId])

  // ── Chargement : pool + livraisons + tournées de la date ─────────────────────
  const loadBoard = useCallback(async () => {
    if (!companyId) return
    setLoadingList(true)
    const [poolRes, allRes, toursRes] = await Promise.all([
      fetchPlannableDeliveries(companyId, date),
      getDeliveriesForDate(companyId, date),
      fetchToursByDate(companyId, date),
    ])
    const poolList = (poolRes.data as unknown as TourDelivery[]) ?? []
    setPool(poolList)
    setAllDeliveries((allRes.data as unknown as TourDelivery[]) ?? [])
    setTours((toursRes.data as unknown as Tour[]) ?? [])

    // Pré-coche les géocodées non encore rattachées (tour_id null).
    setSelectedIds(new Set(
      poolList.filter(d => isGeocoded(d) && d.tour_id == null).map(d => d.id),
    ))
    setLoadingList(false)
  }, [companyId, date])

  useEffect(() => { loadBoard() }, [loadBoard])

  // Réinitialise l'avertissement « non réparties » quand la date change.
  useEffect(() => { setUnassignedCount(0) }, [date])

  // ── Dérivés ──────────────────────────────────────────────────────────────────
  const depotGeocoded = depot.lat != null && depot.lng != null

  const assignments: Assignment[] = useMemo(
    () => [...selectedVehicles].map(vid => ({ vehicle_id: vid, driver_id: driverByVehicle[vid] || null })),
    [selectedVehicles, driverByVehicle],
  )

  const selectedDeliveries = useMemo(
    () => pool.filter(d => selectedIds.has(d.id)),
    [pool, selectedIds],
  )

  const dispatchReady = canDispatch(assignments, selectedDeliveries)

  const grouped = useMemo(() => groupToursWithStops(tours, allDeliveries), [tours, allDeliveries])
  const totals  = useMemo(() => totalsAcrossTours(tours), [tours])

  const vehicleLabel = (id: string | null) => vehicles.find(v => v.id === id)?.label
  const driverLabel  = (id: string | null) => drivers.find(d => d.id === id)?.label

  // Tournées préparées pour la carte d'ensemble (une couleur par tournée, par ordre).
  const overviewTours: OverviewTour[] = useMemo(
    () => grouped.map((g, i) => ({
      id: g.tour.id,
      geometry: g.tour.geometry,
      color: colorForIndex(i),
      vehicleLabel: vehicleLabel(g.tour.vehicle_id) ?? 'Véhicule',
      totalKm: g.tour.total_km,
      totalMin: g.tour.total_duration_min,
      stops: g.stops
        .filter(s => s.delivery_lat != null && s.delivery_lng != null)
        .map(s => ({ stop_order: s.stop_order, lat: s.delivery_lat as number, lng: s.delivery_lng as number })),
    })),
    // vehicleLabel dépend de `vehicles` ; on recalcule quand l'un des deux change.
    [grouped, vehicles], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const hasMapData = depotGeocoded ||
    overviewTours.some(t => (t.geometry && t.geometry.length > 0) || t.stops.length > 0)

  // ── Handlers ───────────────────────────────────────────────────────────────
  const toggleVehicle = (vid: string) => setSelectedVehicles(prev => {
    const next = new Set(prev)
    if (next.has(vid)) next.delete(vid); else next.add(vid)
    return next
  })

  const toggleDelivery = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const handleDispatch = async () => {
    if (!dispatchReady) return
    setDispatching(true)
    try {
      const data = await dispatchAndOptimize(date, assignments, [...selectedIds])
      const un = data.unassigned?.length ?? 0
      setUnassignedCount(un)
      toast(un > 0
        ? `Réparti — ${un} livraison(s) non réparties`
        : `${data.tours.length} tournée(s) réparties et optimisées`)
      await loadBoard()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setDispatching(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  const poolCount = pool.length

  return (
    <Shell pageTitle="Tournées">
      <div className="max-w-3xl space-y-6">

        {/* Date */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Date">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </Field>
        </div>

        {/* Dépôt non géocodé */}
        {!depotGeocoded && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-[var(--r-md)]
            bg-[var(--warning)]/10 border border-[var(--warning)]/30 text-[var(--fs-sm)]">
            <AlertTriangle size={16} className="text-[var(--warning)] mt-0.5 shrink-0" />
            <span className="text-[var(--text-muted)]">
              Le dépôt n'est pas localisé. Renseigne l'adresse du dépôt dans <strong className="text-[var(--text)]">Paramètres</strong> pour pouvoir optimiser.
            </span>
          </div>
        )}

        {/* Véhicules & chauffeurs (affectations) */}
        <Section title={`Véhicules & chauffeurs (${selectedVehicles.size} sélectionné${selectedVehicles.size > 1 ? 's' : ''})`}>
          {vehicles.length === 0 ? (
            <p className="text-[var(--fs-sm)] text-[var(--text-muted)] py-2">Aucun véhicule actif.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {vehicles.map(v => {
                const checked = selectedVehicles.has(v.id)
                return (
                  <li key={v.id} className="flex items-center gap-3 py-2.5">
                    <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                      <input type="checkbox" checked={checked} onChange={() => toggleVehicle(v.id)}
                        className="w-4 h-4 rounded accent-[var(--brand)] shrink-0" />
                      <span className="text-[var(--fs-sm)] text-[var(--text)] truncate">{v.label}</span>
                    </label>
                    <select
                      value={driverByVehicle[v.id] ?? ''}
                      disabled={!checked}
                      onChange={e => setDriverByVehicle(p => ({ ...p, [v.id]: e.target.value }))}
                      className={`${inputCls} max-w-[180px]`}
                    >
                      <option value="">— Chauffeur —</option>
                      {drivers.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                    </select>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>

        {/* Pool de livraisons à répartir */}
        <Section title={`Livraisons à répartir (${poolCount})`}>
          {loadingList ? (
            <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12" />)}</div>
          ) : poolCount === 0 ? (
            <p className="text-[var(--fs-sm)] text-[var(--text-muted)] py-4 text-center">
              Aucune livraison planifiée pour cette date.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {pool.map(d => {
                const geo = isGeocoded(d)
                return (
                  <li key={d.id}>
                    <label className={`flex items-center gap-3 py-2.5 ${geo ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                      <input type="checkbox" checked={selectedIds.has(d.id)} disabled={!geo}
                        onChange={() => toggleDelivery(d.id)}
                        className="w-4 h-4 rounded accent-[var(--brand)] shrink-0" />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[var(--fs-sm)] text-[var(--text)] truncate">
                          {d.clients?.name ?? '—'}
                          {d.description && <span className="text-[var(--text-muted)]"> · {d.description}</span>}
                        </span>
                        <span className="text-[var(--fs-xs)] text-[var(--text-muted)] truncate">{d.delivery_address ?? '—'}</span>
                      </div>
                      {geo
                        ? <MapPin size={14} className="text-[var(--success)] shrink-0" />
                        : <span className="text-[var(--fs-xs)] text-[var(--text-disabled)] shrink-0">adresse à géocoder</span>}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border)] mt-2">
            <Button variant="primary" className="min-h-[44px]" onClick={handleDispatch}
              disabled={dispatching || !dispatchReady}
              title={!dispatchReady ? 'Coche au moins un véhicule et une livraison géocodée' : undefined}>
              {dispatching ? 'Répartition…' : 'Répartir & optimiser'}
            </Button>
            <span className="text-[var(--fs-xs)] text-[var(--text-muted)] ml-auto">
              {selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}
            </span>
          </div>
        </Section>

        {/* Avertissement non réparties */}
        {unassignedCount > 0 && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-[var(--r-md)]
            bg-[var(--warning)]/10 border border-[var(--warning)]/30 text-[var(--fs-sm)]">
            <AlertTriangle size={16} className="text-[var(--warning)] mt-0.5 shrink-0" />
            <span className="text-[var(--text-muted)]">
              {unassignedCount} livraison(s) non réparties (capacité insuffisante ou non géocodées).
            </span>
          </div>
        )}

        {/* Récap + carte d'ensemble + tournées */}
        {tours.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat icon={<Route size={15} />} label="Distance cumulée"
                value={`${totals.totalKm.toFixed(1)} km`} />
              <Stat icon={<Clock size={15} />} label="Durée cumulée"
                value={formatDuration(totals.totalMin)} />
            </div>

            {/* Carte d'ensemble — toutes les tournées, une couleur par véhicule */}
            {hasMapData && (
              <Suspense fallback={
                <div className="h-[420px] w-full rounded-[var(--r-lg)] border border-[var(--border)]
                  flex items-center justify-center text-[var(--fs-sm)] text-[var(--text-muted)]">
                  Chargement de la carte…
                </div>
              }>
                <ToursOverviewMap
                  tours={overviewTours}
                  depot={depotGeocoded ? { lat: depot.lat as number, lng: depot.lng as number } : null}
                />
              </Suspense>
            )}

            <div className="flex flex-col gap-4">
              {grouped.map((g, i) => (
                <TourCard
                  key={g.tour.id}
                  tour={g.tour}
                  stops={g.stops}
                  vehicleLabel={vehicleLabel(g.tour.vehicle_id)}
                  driverLabel={driverLabel(g.tour.driver_id)}
                  color={colorForIndex(i)}
                  onChanged={loadBoard}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </Shell>
  )
}

// ── Sous-composants ────────────────────────────────────────────────────────────

const inputCls = `w-full h-9 px-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--brand)]
  transition-colors disabled:opacity-50 disabled:cursor-not-allowed`

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border)] overflow-hidden">
      <div className="px-4 py-2.5 bg-[var(--bg-elevated)] border-b border-[var(--border)]">
        <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="bg-[var(--bg-card)] rounded-[var(--r-md)] border border-[var(--border)] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[var(--text-muted)] mb-1">
        {icon}
        <span className="text-[var(--fs-xs)] uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-[var(--fs-lg)] font-semibold text-[var(--text)]">{value}</p>
    </div>
  )
}
