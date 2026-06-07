import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import {
  Route, MapPin, Navigation, Navigation2, ExternalLink, Check,
  Clock, Fuel, AlertTriangle,
} from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { Skeleton } from '../../shared/ui/Skeleton'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { formatMoney } from '../../shared/lib/money'
import { toLocalISO } from '../../shared/lib/dates'
// Machine d'états unique (réutilisée, pas dupliquée) — cf. consigne d'étape.
import { canTransition } from '../livraisons/livraisons.logic'
import {
  getCompanyDepot, getActiveVehicles, getActiveDrivers,
  getDeliveriesForDate, findTour, getTourStops,
  createTour, updateTour, assignDeliveries, unassignDeliveries, optimizeTour,
  markDelivered, setTourStatus,
} from './tournees.queries'
import {
  eligibleDeliveries, isGeocoded, canOptimize, estimateFuelCostCts,
  googleMapsStopUrl, wazeUrl, googleMapsRouteUrl,
  isDelivered, deliveredProgress, hasUndeliveredStops, canStartTour, canFinishTour,
} from './tournees.logic'
import type { Tour, TourDelivery, TourStatus, OptimizeResult, Lookup } from './tournees.types'
import type { MapStop } from './TourMap'

// Lazy-load : Leaflet n'alourdit pas le bundle initial.
const TourMap = lazy(() => import('./TourMap'))

const STATUS_LABELS: Record<TourStatus, string> = {
  brouillon: 'Brouillon', optimisee: 'Optimisée', en_cours: 'En cours', terminee: 'Terminée',
}
const STATUS_COLORS: Record<TourStatus, 'muted' | 'info' | 'warning' | 'success'> = {
  brouillon: 'muted', optimisee: 'info', en_cours: 'warning', terminee: 'success',
}

export function Tournees() {
  const { companyId } = useProfile()
  const { toast } = useToast()

  const [date, setDate]           = useState(toLocalISO(new Date()))
  const [vehicleId, setVehicleId] = useState('')
  const [driverId, setDriverId]   = useState('')

  const [vehicles, setVehicles] = useState<Lookup[]>([])
  const [drivers, setDrivers]   = useState<Lookup[]>([])
  const [depot, setDepot] = useState<{ lat: number | null; lng: number | null; name: string }>(
    { lat: null, lng: null, name: '' },
  )

  const [deliveries, setDeliveries]   = useState<TourDelivery[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [tour, setTour]   = useState<Tour | null>(null)
  const [stops, setStops] = useState<TourDelivery[]>([])

  const [loadingList, setLoadingList] = useState(false)
  const [saving, setSaving]           = useState(false)
  const [optimizing, setOptimizing]   = useState(false)
  const [stopBusy, setStopBusy]       = useState<string | null>(null)
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)

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

  // ── Chargement du plan de travail (livraisons + tournée du jour/véhicule) ────
  const loadBoard = useCallback(async () => {
    if (!companyId) return
    setLoadingList(true)

    const { data: del } = await getDeliveriesForDate(companyId, date)
    const list = (del as unknown as TourDelivery[]) ?? []
    setDeliveries(list)

    let found: Tour | null = null
    if (vehicleId) {
      const { data: t } = await findTour(companyId, date, vehicleId)
      found = (t as Tour | null) ?? null
    }
    setTour(found)

    // Préselection : livraisons déjà rattachées à cette tournée.
    const preselected = found ? list.filter(d => d.tour_id === found!.id).map(d => d.id) : []
    setSelectedIds(new Set(preselected))
    if (found?.driver_id) setDriverId(found.driver_id)

    // Arrêts ordonnés si la tournée est déjà optimisée.
    if (found && found.status !== 'brouillon') {
      const { data: s } = await getTourStops(found.id)
      setStops((s as unknown as TourDelivery[]) ?? [])
    } else {
      setStops([])
    }
    setLoadingList(false)
  }, [companyId, date, vehicleId])

  useEffect(() => { loadBoard() }, [loadBoard])

  // ── Dérivés ──────────────────────────────────────────────────────────────────
  const eligible = eligibleDeliveries(deliveries)
  const depotGeocoded = depot.lat != null && depot.lng != null
  const assignedGeocoded = deliveries.filter(d => d.tour_id === tour?.id && isGeocoded(d))
  const optimizeEnabled = !!tour && canOptimize(assignedGeocoded.length, depotGeocoded)
  const fuelCts = estimateFuelCostCts(tour?.total_km ?? null)

  // Arrêts géocodés pour la carte (ordonnés via stop_order côté requête).
  const mapStops: MapStop[] = stops
    .filter(s => s.delivery_lat != null && s.delivery_lng != null)
    .map(s => ({
      stop_order: s.stop_order,
      lat: s.delivery_lat as number,
      lng: s.delivery_lng as number,
      label: s.clients?.name ?? '—',
    }))

  // Suivi + navigation.
  const progress = deliveredProgress(stops)
  const undeliveredCount = stops.filter(s => !isDelivered(s)).length
  const routeUrl = googleMapsRouteUrl(
    depotGeocoded ? { lat: depot.lat as number, lng: depot.lng as number } : null,
    mapStops.map(s => ({ stop_order: s.stop_order, lat: s.lat, lng: s.lng })),
  )

  const toggle = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  // ── Créer / mettre à jour la tournée ─────────────────────────────────────────
  const handleSaveTour = async () => {
    if (!companyId) return
    if (!vehicleId) { toast('Sélectionnez un véhicule', 'error'); return }

    setSaving(true)
    try {
      let current = tour
      if (!current) {
        const { data, error } = await createTour({
          company_id: companyId, date, vehicle_id: vehicleId,
          driver_id: driverId || null, status: 'brouillon',
          depot_lat: depot.lat, depot_lng: depot.lng,
        })
        if (error) throw error
        current = data as Tour
      } else {
        const { data, error } = await updateTour(current.id, {
          driver_id: driverId || null, depot_lat: depot.lat, depot_lng: depot.lng,
        })
        if (error) throw error
        current = data as Tour
      }

      // Diff : on assigne les cochées, on détache celles retirées de cette tournée.
      const toAssign = [...selectedIds]
      const previously = deliveries.filter(d => d.tour_id === current!.id).map(d => d.id)
      const toUnassign = previously.filter(id => !selectedIds.has(id))

      const a = await assignDeliveries(toAssign, current.id)
      if (a.error) throw a.error
      const u = await unassignDeliveries(toUnassign)
      if (u.error) throw u.error

      toast('Tournée enregistrée')
      await loadBoard()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Optimiser l'ordre ────────────────────────────────────────────────────────
  const handleOptimize = async () => {
    if (!tour) return
    setOptimizing(true)
    try {
      const { data, error } = await optimizeTour(tour.id)
      if (error) {
        toast(`Optimisation impossible : ${error.message}`, 'error')
        return
      }
      const res = data as OptimizeResult
      if (!res?.ok) {
        // Message complet (y compris data.body) pour le debug ORS.
        const detail = res?.body != null ? ` — ${JSON.stringify(res.body)}` : ''
        toast(`Optimisation échouée : ${res?.error ?? 'erreur inconnue'}${detail}`, 'error')
        return
      }
      toast('Tournée optimisée')
      await loadBoard()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setOptimizing(false)
    }
  }

  // ── Suivi : marquer un arrêt livré (via la machine d'états) ──────────────────
  const handleMarkDelivered = async (s: TourDelivery) => {
    if (!canTransition(s.statut, 'livree')) {
      toast(`Transition ${s.statut} → livrée impossible`, 'error'); return
    }
    setStopBusy(s.id)
    const { error } = await markDelivered(s.id, new Date().toISOString())
    setStopBusy(null)
    if (error) { toast(error.message, 'error'); return }
    toast('Arrêt livré')
    await loadBoard()
  }

  // ── Cycle de vie de la tournée ───────────────────────────────────────────────
  const handleStartTour = async () => {
    if (!tour) return
    setLifecycleBusy(true)
    const { error } = await setTourStatus(tour.id, 'en_cours')
    setLifecycleBusy(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Tournée démarrée')
    await loadBoard()
  }

  const doFinishTour = async () => {
    if (!tour) return
    setLifecycleBusy(true)
    const { error } = await setTourStatus(tour.id, 'terminee')
    setLifecycleBusy(false)
    setConfirmFinish(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Tournée terminée')
    await loadBoard()
  }

  const handleFinishTour = () => {
    if (!tour) return
    if (hasUndeliveredStops(stops)) { setConfirmFinish(true); return }
    doFinishTour()
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <Shell pageTitle="Tournées">
      <div className="max-w-3xl space-y-6">

        {/* Sélecteurs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Date">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Véhicule">
            <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} className={inputCls}>
              <option value="">— Sélectionner —</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Chauffeur">
            <select value={driverId} onChange={e => setDriverId(e.target.value)} className={inputCls}>
              <option value="">— Aucun —</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
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

        {/* Statut tournée */}
        {tour && (
          <div className="flex items-center gap-2">
            <span className="text-[var(--fs-sm)] text-[var(--text-muted)]">Tournée :</span>
            <Badge color={STATUS_COLORS[tour.status]}>{STATUS_LABELS[tour.status]}</Badge>
            {tour.optimized_at && (
              <span className="text-[var(--fs-xs)] text-[var(--text-muted)] font-mono">
                optimisée le {new Date(tour.optimized_at).toLocaleDateString('fr-FR')}
              </span>
            )}
          </div>
        )}

        {/* Livraisons éligibles */}
        <Section title={`Livraisons du jour (${eligible.length})`}>
          {loadingList ? (
            <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12" />)}</div>
          ) : eligible.length === 0 ? (
            <p className="text-[var(--fs-sm)] text-[var(--text-muted)] py-4 text-center">
              Aucune livraison planifiée pour cette date.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {eligible.map(d => {
                const geo = isGeocoded(d)
                return (
                  <li key={d.id}>
                    <label className={`flex items-center gap-3 py-2.5 ${geo ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(d.id)}
                        disabled={!geo}
                        onChange={() => toggle(d.id)}
                        className="w-4 h-4 rounded accent-[var(--brand)] shrink-0"
                      />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[var(--fs-sm)] text-[var(--text)] truncate">
                          {d.clients?.name ?? '—'}
                          {d.description && <span className="text-[var(--text-muted)]"> · {d.description}</span>}
                        </span>
                        <span className="text-[var(--fs-xs)] text-[var(--text-muted)] truncate">
                          {d.delivery_address ?? '—'}
                        </span>
                      </div>
                      {geo
                        ? <MapPin size={14} className="text-[var(--success)] shrink-0" />
                        : <span className="text-[var(--fs-xs)] text-[var(--text-disabled)] shrink-0">adresse non localisée</span>}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border)] mt-2">
            <Button variant="primary" onClick={handleSaveTour}
              disabled={saving || !vehicleId || eligible.length === 0}>
              {saving ? 'Enregistrement…' : 'Créer / mettre à jour la tournée'}
            </Button>
            <Button variant="secondary" onClick={handleOptimize}
              disabled={optimizing || !optimizeEnabled}
              title={!optimizeEnabled ? 'Enregistre d’abord ≥ 2 arrêts géocodés et un dépôt localisé' : undefined}>
              <Navigation size={14} />
              {optimizing ? 'Optimisation…' : 'Optimiser l’ordre'}
            </Button>
            <span className="text-[var(--fs-xs)] text-[var(--text-muted)] ml-auto">
              {selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}
            </span>
          </div>
        </Section>

        {/* Résultat de l'optimisation */}
        {tour && tour.status !== 'brouillon' && stops.length > 0 && (
          <Section title="Tournée optimisée">
            {/* Totaux */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Stat icon={<Route size={15} />} label="Distance"
                value={tour.total_km != null ? `${Number(tour.total_km).toFixed(1)} km` : '—'} />
              <Stat icon={<Clock size={15} />} label="Durée"
                value={tour.total_duration_min != null ? formatDuration(tour.total_duration_min) : '—'} />
              <Stat icon={<Fuel size={15} />} label="Carburant (est.)"
                value={fuelCts > 0 ? formatMoney(fuelCts) : '—'} />
            </div>

            {/* Barre de contrôle : cycle de vie + itinéraire + progression */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {canStartTour(tour.status) && (
                <Button variant="primary" className="min-h-[44px]" onClick={handleStartTour} disabled={lifecycleBusy}>
                  {lifecycleBusy ? '…' : 'Démarrer la tournée'}
                </Button>
              )}
              {canFinishTour(tour.status) && (
                <Button variant="primary" className="min-h-[44px]" onClick={handleFinishTour} disabled={lifecycleBusy}>
                  {lifecycleBusy ? '…' : 'Terminer la tournée'}
                </Button>
              )}
              {routeUrl && (
                <a href={routeUrl} target="_blank" rel="noopener noreferrer" className={linkBtnCls}>
                  <ExternalLink size={15} /> Itinéraire complet
                </a>
              )}
              <span className="ml-auto text-[var(--fs-sm)] font-medium text-[var(--text)]">
                {progress.delivered} / {progress.total} arrêts livrés
              </span>
            </div>

            {/* Liste ordonnée — pensée mobile (cibles tactiles larges) */}
            <ol className="flex flex-col">
              {stops.map((s, i) => {
                const delivered = isDelivered(s)
                const geo = s.delivery_lat != null && s.delivery_lng != null
                return (
                  <li key={s.id}
                    className={`flex flex-col gap-2 py-3 border-b border-[var(--border)] last:border-0 ${delivered ? 'opacity-60' : ''}`}>
                    <div className="flex items-start gap-3">
                      <span className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 text-[var(--fs-xs)] font-bold
                        ${delivered ? 'bg-[var(--success)] text-white' : 'bg-[var(--brand-soft)] text-[var(--brand)]'}`}>
                        {delivered ? <Check size={15} /> : (s.stop_order ?? i + 1)}
                      </span>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className={`text-[var(--fs-sm)] text-[var(--text)] truncate ${delivered ? 'line-through' : ''}`}>
                          {s.clients?.name ?? '—'}
                        </span>
                        <span className="text-[var(--fs-xs)] text-[var(--text-muted)] truncate">{s.delivery_address ?? '—'}</span>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        {delivered && s.delivered_at && (
                          <span className="font-mono text-[var(--fs-xs)] text-[var(--success)]">livré {formatTime(s.delivered_at)}</span>
                        )}
                        {!delivered && s.arrival_time && (
                          <span className="font-mono text-[var(--fs-xs)] text-[var(--text-muted)]">~ {s.arrival_time.slice(0, 5)}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions de l'arrêt */}
                    <div className="flex items-center gap-2 pl-10">
                      {geo && (
                        <>
                          <a href={googleMapsStopUrl(s.delivery_lat as number, s.delivery_lng as number)}
                            target="_blank" rel="noopener noreferrer" className={linkBtnCls}>
                            <Navigation2 size={14} /> Naviguer
                          </a>
                          <a href={wazeUrl(s.delivery_lat as number, s.delivery_lng as number)}
                            target="_blank" rel="noopener noreferrer"
                            className="text-[var(--fs-xs)] text-[var(--text-muted)] underline px-1 py-2">
                            Waze
                          </a>
                        </>
                      )}
                      {!delivered && canTransition(s.statut, 'livree') && (
                        <Button variant="primary" className="min-h-[40px] ml-auto"
                          onClick={() => handleMarkDelivered(s)} disabled={stopBusy === s.id}>
                          <Check size={15} /> {stopBusy === s.id ? '…' : 'Livré'}
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
            <p className="text-[var(--fs-xs)] text-[var(--text-disabled)] mt-3">
              Estimation carburant indicative (0,15 €/km).
            </p>

            {/* Carte */}
            {tour.geometry && depotGeocoded && (
              <div className="mt-4">
                <Suspense fallback={
                  <div className="h-[400px] w-full rounded-[var(--r-lg)] border border-[var(--border)]
                    flex items-center justify-center text-[var(--fs-sm)] text-[var(--text-muted)]">
                    Chargement de la carte…
                  </div>
                }>
                  <TourMap
                    geometry={tour.geometry}
                    depot={{ lat: depot.lat!, lng: depot.lng! }}
                    stops={mapStops}
                  />
                </Suspense>
              </div>
            )}
          </Section>
        )}
      </div>

      <ConfirmDialog
        open={confirmFinish}
        title="Terminer la tournée ?"
        message={`Il reste ${undeliveredCount} arrêt(s) non livré(s). Terminer quand même ?`}
        confirmLabel="Terminer"
        onConfirm={doFinishTour}
        onCancel={() => setConfirmFinish(false)}
        loading={lifecycleBusy}
      />
    </Shell>
  )
}

// ── Sous-composants ────────────────────────────────────────────────────────────

const inputCls = `w-full h-9 px-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--brand)]
  transition-colors disabled:opacity-50 disabled:cursor-not-allowed`

// Lien stylé en bouton (cible tactile ≥ 40px pour usage mobile au pouce).
const linkBtnCls = `inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[var(--r-md)]
  border border-[var(--border-soft)] text-[var(--text)] text-[var(--fs-sm)]
  hover:bg-[var(--bg-card-hover)] transition-colors no-underline`

function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

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
