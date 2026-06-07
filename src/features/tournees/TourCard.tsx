import { useState, lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { Route, Navigation2, ExternalLink, Check, Clock, Fuel, Truck, User } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { formatMoney } from '../../shared/lib/money'
// Machine d'états unique (réutilisée, pas dupliquée).
import { canTransition } from '../livraisons/livraisons.logic'
import { markDelivered, setTourStatus } from './tournees.queries'
import {
  estimateFuelCostCts, googleMapsStopUrl, wazeUrl, googleMapsRouteUrl,
  isDelivered, deliveredProgress, hasUndeliveredStops, canStartTour, canFinishTour,
} from './tournees.logic'
import type { Tour, TourDelivery, TourStatus } from './tournees.types'
import type { MapStop } from './TourMap'

// Lazy-load : Leaflet hors bundle initial (chunk partagé).
const TourMap = lazy(() => import('./TourMap'))

const STATUS_LABELS: Record<TourStatus, string> = {
  brouillon: 'Brouillon', optimisee: 'Optimisée', en_cours: 'En cours', terminee: 'Terminée',
}
const STATUS_COLORS: Record<TourStatus, 'muted' | 'info' | 'warning' | 'success'> = {
  brouillon: 'muted', optimisee: 'info', en_cours: 'warning', terminee: 'success',
}

interface Props {
  tour: Tour
  stops: TourDelivery[]
  vehicleLabel?: string
  driverLabel?: string
  /** Appelé après une modification (livré, démarrer, terminer) pour recharger. */
  onChanged: () => void | Promise<void>
}

/**
 * Rendu exploitable d'UNE tournée : en-tête véhicule/chauffeur, totaux, carte,
 * liste d'arrêts ordonnés (navigation GPS + suivi « Livré »), cycle de vie.
 * Comportement strictement identique au mono v2. Pensé mobile.
 */
export function TourCard({ tour, stops, vehicleLabel, driverLabel, onChanged }: Props) {
  const { toast } = useToast()
  const [stopBusy, setStopBusy] = useState<string | null>(null)
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)

  const depotGeocoded = tour.depot_lat != null && tour.depot_lng != null
  const fuelCts = estimateFuelCostCts(tour.total_km)
  const progress = deliveredProgress(stops)
  const undeliveredCount = stops.filter(s => !isDelivered(s)).length

  const mapStops: MapStop[] = stops
    .filter(s => s.delivery_lat != null && s.delivery_lng != null)
    .map(s => ({
      stop_order: s.stop_order,
      lat: s.delivery_lat as number,
      lng: s.delivery_lng as number,
      label: s.clients?.name ?? '—',
    }))

  const routeUrl = googleMapsRouteUrl(
    depotGeocoded ? { lat: tour.depot_lat as number, lng: tour.depot_lng as number } : null,
    mapStops.map(s => ({ stop_order: s.stop_order, lat: s.lat, lng: s.lng })),
  )

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleMarkDelivered = async (s: TourDelivery) => {
    if (!canTransition(s.statut, 'livree')) {
      toast(`Transition ${s.statut} → livrée impossible`, 'error'); return
    }
    setStopBusy(s.id)
    const { error } = await markDelivered(s.id, new Date().toISOString())
    setStopBusy(null)
    if (error) { toast(error.message, 'error'); return }
    toast('Arrêt livré')
    await onChanged()
  }

  const handleStartTour = async () => {
    setLifecycleBusy(true)
    const { error } = await setTourStatus(tour.id, 'en_cours')
    setLifecycleBusy(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Tournée démarrée')
    await onChanged()
  }

  const doFinishTour = async () => {
    setLifecycleBusy(true)
    const { error } = await setTourStatus(tour.id, 'terminee')
    setLifecycleBusy(false)
    setConfirmFinish(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Tournée terminée')
    await onChanged()
  }

  const handleFinishTour = () => {
    if (hasUndeliveredStops(stops)) { setConfirmFinish(true); return }
    doFinishTour()
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border)] overflow-hidden">
      {/* En-tête véhicule / chauffeur + statut */}
      <div className="px-4 py-3 bg-[var(--bg-elevated)] border-b border-[var(--border)] flex flex-wrap items-center gap-2">
        <Truck size={16} className="text-[var(--brand)] shrink-0" />
        <span className="font-display font-semibold text-[var(--text)]">{vehicleLabel ?? 'Véhicule'}</span>
        {driverLabel && (
          <span className="inline-flex items-center gap-1 text-[var(--fs-sm)] text-[var(--text-muted)]">
            <User size={13} /> {driverLabel}
          </span>
        )}
        <Badge color={STATUS_COLORS[tour.status]}>{STATUS_LABELS[tour.status]}</Badge>
        <span className="ml-auto text-[var(--fs-sm)] font-medium text-[var(--text)]">
          {progress.delivered} / {progress.total} livrés
        </span>
      </div>

      <div className="p-4">
        {/* Totaux */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Stat icon={<Route size={15} />} label="Distance"
            value={tour.total_km != null ? `${Number(tour.total_km).toFixed(1)} km` : '—'} />
          <Stat icon={<Clock size={15} />} label="Durée"
            value={tour.total_duration_min != null ? formatDuration(tour.total_duration_min) : '—'} />
          <Stat icon={<Fuel size={15} />} label="Carburant (est.)"
            value={fuelCts > 0 ? formatMoney(fuelCts) : '—'} />
        </div>

        {/* Cycle de vie + itinéraire complet */}
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
        </div>

        {/* Liste ordonnée — mobile-first */}
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
                depot={{ lat: tour.depot_lat as number, lng: tour.depot_lng as number }}
                stops={mapStops}
              />
            </Suspense>
          </div>
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
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

const linkBtnCls = `inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[var(--r-md)]
  border border-[var(--border-soft)] text-[var(--text)] text-[var(--fs-sm)]
  hover:bg-[var(--bg-card-hover)] transition-colors no-underline`

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
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
