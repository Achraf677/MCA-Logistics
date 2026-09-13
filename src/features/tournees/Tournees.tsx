import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { Route, Clock, MapPin, AlertTriangle, ArrowUp, ArrowDown, PackageOpen } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { useProfile, supabase } from '../../app/providers'
import { toLocalISO } from '../../shared/lib/dates'
import {
  getCompanyDepot, getActiveVehicles, getActiveDrivers,
  fetchPlannableDeliveries, getDeliveriesForDate, fetchToursByDate,
  dispatchAndOptimize, repartirDansMonOrdre,
} from './tournees.queries'
import {
  isGeocoded, canDispatch, groupToursWithStops, totalsAcrossTours,
  deplacerArret, planDeChargement,
} from './tournees.logic'
import { TourCard, formatDuration } from './TourCard'
import { colorForIndex } from './tours.palette'
import type { OverviewTour } from './ToursOverviewMap'
import type { Tour, TourDelivery, Assignment, Lookup } from './tournees.types'
import { Field } from '../../shared/ui/Field'

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
  /**
   * Ordre imposé à la main sur le pool, avant toute répartition.
   *
   * État LOCAL et non persisté : tant qu'une livraison n'est rattachée à
   * aucune tournée, son `stop_order` ne veut rien dire — l'écrire en base
   * ferait ressortir un numéro d'arrêt sur une course qui n'a pas de tournée.
   * L'ordre devient réel au moment de la répartition, pas avant.
   */
  const [ordrePool, setOrdrePool] = useState<string[]>([])

  const [loadingList, setLoadingList] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const [unassignedCount, setUnassignedCount] = useState(0)

  // Résultat du dernier backfill géocodage — pour lister les adresses non résolues.
  const [geocodeReport, setGeocodeReport] =
    useState<{ echecs: string[]; depotMissingAddress: boolean } | null>(null)

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
    setOrdrePool(poolList.map(d => d.id))
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

  // ── Géocodage manquant : bouton de rattrapage 1-clic ───────────────────────
  const [geocoding, setGeocoding] = useState(false)
  const handleBackfillGeocode = async () => {
    setGeocoding(true)
    try {
      const { data, error } = await supabase.functions.invoke('geocode', {
        body: { backfill: true },
      })
      if (error || !data?.ok) {
        toast(error?.message ?? data?.error ?? 'Échec du géocodage', 'error')
        return
      }
      const d = data.data as {
        depot_ok: 'skipped' | 'ok' | 'echec' | 'no_address'
        deliveries_ok: number
        deliveries_echec: number
        echecs?: string[]
        depot_missing_address?: boolean
      }
      const parts: string[] = []
      if (d.depot_ok === 'ok') parts.push('dépôt localisé')
      if (d.depot_ok === 'no_address') parts.push('adresse du dépôt manquante')
      if (d.deliveries_ok > 0) parts.push(`${d.deliveries_ok} livraison(s) localisée(s)`)
      if (d.deliveries_echec > 0) parts.push(`${d.deliveries_echec} échec(s)`)
      toast(parts.length ? parts.join(' · ') : 'Aucune adresse à géocoder',
        d.depot_ok === 'no_address' || d.deliveries_echec > 0 ? 'error' : 'success')
      setGeocodeReport({
        echecs: d.echecs ?? [],
        depotMissingAddress: !!d.depot_missing_address,
      })

      // Recharge le dépôt (pour lever le blocage) puis le board si dispo.
      if (companyId) {
        const { data: fresh } = await getCompanyDepot(companyId)
        if (fresh) setDepot({ lat: fresh.depot_lat, lng: fresh.depot_lng, name: fresh.name })
      }
      await loadBoard()
    } finally {
      setGeocoding(false)
    }
  }

  // ── Dérivés ──────────────────────────────────────────────────────────────────
  const depotGeocoded = depot.lat != null && depot.lng != null

  const assignments: Assignment[] = useMemo(
    () => [...selectedVehicles].map(vid => ({ vehicle_id: vid, driver_id: driverByVehicle[vid] || null })),
    [selectedVehicles, driverByVehicle],
  )

  /**
   * Le pool dans l'ordre choisi.
   *
   * Les livraisons absentes de `ordrePool` sont placées à la fin plutôt que
   * masquées : `pool` et `ordrePool` sont deux `setState` distincts, et une
   * course qui disparaîtrait le temps d'un rendu serait un bug bien plus
   * déroutant qu'une course en fin de liste.
   */
  const poolOrdonne = useMemo(() => {
    const rang = new Map(ordrePool.map((id, i) => [id, i]))
    return [...pool].sort(
      (a, b) => (rang.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rang.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    )
  }, [pool, ordrePool])

  const selectedDeliveries = useMemo(
    () => poolOrdonne.filter(d => selectedIds.has(d.id)),
    [poolOrdonne, selectedIds],
  )

  /** Ce qui partira réellement en tournée, dans l'ordre affiché à l'écran. */
  const idsSelectionnesOrdonnes = useMemo(
    () => selectedDeliveries.map(d => d.id),
    [selectedDeliveries],
  )

  /**
   * Plan de chargement : l'inverse de l'ordre de livraison. Un fourgon se
   * charge par une seule porte, donc le premier client livré doit être chargé
   * en dernier, contre la porte.
   */
  const chargement = useMemo(() => planDeChargement(selectedDeliveries), [selectedDeliveries])

  const dispatchReady = canDispatch(assignments, selectedDeliveries)

  // « Répartir dans mon ordre » n'a de sens que sur UN véhicule : répartir sur
  // plusieurs, c'est exactement le travail de l'optimiseur, et un ordre unique
  // ne dit pas qui prend quoi.
  const vehiculeUnique = selectedVehicles.size === 1 ? [...selectedVehicles][0] : null
  const ordreReady = vehiculeUnique != null && idsSelectionnesOrdonnes.length > 0

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

  /**
   * Monte ou descend une livraison dans le pool.
   *
   * Purement local : rien n'est écrit tant que la répartition n'a pas eu lieu.
   */
  const deplacerDansPool = (id: string, sens: 'haut' | 'bas') => {
    setOrdrePool(prev => deplacerArret(prev.length > 0 ? prev : pool.map(d => d.id), id, sens))
  }

  /**
   * Répartit sur UN véhicule en gardant l'ordre choisi, sans optimisation.
   *
   * L'ordre humain et l'optimisation ne peuvent pas gagner en même temps : la
   * seconde recalcule `stop_order` et effacerait le premier. Deux boutons, deux
   * promesses distinctes, plutôt qu'un bouton qui trahit l'une des deux.
   */
  const handleRepartirDansMonOrdre = async () => {
    if (!companyId || !vehiculeUnique || !ordreReady) return
    setDispatching(true)
    const { error } = await repartirDansMonOrdre({
      companyId,
      date,
      vehicleId: vehiculeUnique,
      driverId: driverByVehicle[vehiculeUnique] || null,
      depotLat: depot.lat,
      depotLng: depot.lng,
      idsDansLOrdre: idsSelectionnesOrdonnes,
    })
    setDispatching(false)
    if (error) { toast(error.message, 'error'); return }
    setUnassignedCount(0)
    toast(`${idsSelectionnesOrdonnes.length} livraison(s) rangée(s) dans ton ordre`)
    await loadBoard()
  }

  const handleDispatch = async () => {
    if (!dispatchReady) return
    setDispatching(true)
    try {
      const data = await dispatchAndOptimize(date, assignments, idsSelectionnesOrdonnes)
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

        {/* Dépôt non géocodé — bouton de rattrapage 1-clic (Edge geocode). */}
        {!depotGeocoded && (
          <div className="flex flex-wrap items-start gap-3 px-4 py-3 rounded-[var(--r-md)]
            bg-[var(--warning)]/10 border border-[var(--warning)]/30 text-[var(--fs-sm)]">
            <AlertTriangle size={16} className="text-[var(--warning)] mt-0.5 shrink-0" />
            <span className="text-[var(--text-muted)] flex-1 min-w-0">
              Le dépôt et certaines livraisons ne sont pas encore localisés.
            </span>
            <Button
              variant="secondary"
              size="compact"
              onClick={handleBackfillGeocode}
              disabled={geocoding}
            >
              {geocoding ? 'Géocodage…' : 'Géocoder les adresses manquantes'}
            </Button>
          </div>
        )}

        {/* Rapport du dernier backfill — adresses non résolues (à corriger manuellement). */}
        {geocodeReport && (geocodeReport.echecs.length > 0 || geocodeReport.depotMissingAddress) && (
          <div className="flex flex-col gap-2 px-4 py-3 rounded-[var(--r-md)]
            bg-[var(--danger)]/10 border border-[var(--danger)]/30 text-[var(--fs-sm)]">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-[var(--danger)] mt-0.5 shrink-0" />
              <span className="text-[var(--text)] font-medium flex-1">
                {geocodeReport.depotMissingAddress
                  ? "Adresse du dépôt manquante — renseigne-la dans Paramètres puis relance le géocodage."
                  : `${geocodeReport.echecs.length} adresse(s) non résolue(s) — corrige-les puis relance :`}
              </span>
              <button
                type="button"
                onClick={() => setGeocodeReport(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text)] text-[var(--fs-xs)]"
              >
                Fermer
              </button>
            </div>
            {geocodeReport.echecs.length > 0 && (
              <ul className="list-disc pl-8 text-[var(--fs-xs)] text-[var(--text-muted)] max-h-40 overflow-auto">
                {geocodeReport.echecs.map((addr, i) => (
                  <li key={i} className="font-mono">{addr}</li>
                ))}
              </ul>
            )}
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
            <>
              {/* L'ordre se lit ici, et il compte : c'est celui qui deviendra
                  l'ordre des arrêts si tu répartis sans optimiser. */}
              <p className="text-[var(--fs-xs)] text-[var(--text-muted)] pb-2">
                Range-les dans l'ordre où tu veux LIVRER. Le plan de chargement en dessous
                s'en déduit tout seul.
              </p>
              <ul className="flex flex-col divide-y divide-[var(--border)]">
                {poolOrdonne.map((d, i) => {
                  const geo = isGeocoded(d)
                  const coche = selectedIds.has(d.id)
                  // Numéro de livraison : compté parmi les cochées seulement,
                  // parce que seules celles-là partiront en tournée.
                  const rang = coche ? idsSelectionnesOrdonnes.indexOf(d.id) + 1 : null
                  return (
                    <li key={d.id} className="flex items-center gap-2 py-2.5">
                      <label className={`flex items-center gap-3 flex-1 min-w-0 ${geo ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                        <input type="checkbox" checked={coche} disabled={!geo}
                          onChange={() => toggleDelivery(d.id)}
                          className="w-4 h-4 rounded accent-[var(--brand)] shrink-0" />
                        <span className={`flex items-center justify-center w-6 h-6 shrink-0 rounded-full text-[var(--fs-xs)] font-bold
                          ${rang ? 'bg-[var(--brand-soft)] text-[var(--brand)]' : 'text-[var(--text-disabled)]'}`}>
                          {rang ?? '–'}
                        </span>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[var(--fs-sm)] text-[var(--text)] truncate">
                            {d.clients?.name ?? '—'}
                            {d.description && <span className="text-[var(--text-muted)]"> · {d.description}</span>}
                          </span>
                          <span className="text-[var(--fs-xs)] text-[var(--text-muted)] truncate">{d.delivery_address ?? '—'}</span>
                          {d.pickup_address && (
                            <span className="text-[var(--fs-xs)] text-[var(--text-disabled)] truncate">
                              retrait : {d.pickup_address}
                            </span>
                          )}
                        </div>
                        {geo
                          ? <MapPin size={14} className="text-[var(--success)] shrink-0" />
                          : <span className="text-[var(--fs-xs)] text-[var(--text-disabled)] shrink-0">adresse à géocoder</span>}
                      </label>
                      <span className="flex items-center shrink-0">
                        <button type="button" onClick={() => deplacerDansPool(d.id, 'haut')}
                          disabled={i === 0} aria-label="Monter cette livraison"
                          className={flecheCls}><ArrowUp size={15} /></button>
                        <button type="button" onClick={() => deplacerDansPool(d.id, 'bas')}
                          disabled={i === poolOrdonne.length - 1} aria-label="Descendre cette livraison"
                          className={flecheCls}><ArrowDown size={15} /></button>
                      </span>
                    </li>
                  )
                })}
              </ul>

              {/* PLAN DE CHARGEMENT — l'inverse de l'ordre de livraison. */}
              {chargement.length > 1 && (
                <div className="mt-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-card)] p-3">
                  <div className="flex items-center gap-1.5 mb-1 text-[var(--brand)]">
                    <PackageOpen size={15} />
                    <span className="text-[var(--fs-xs)] font-semibold uppercase tracking-wide">
                      Plan de chargement
                    </span>
                  </div>
                  <p className="text-[var(--fs-xs)] text-[var(--text-muted)] mb-2">
                    Un fourgon se vide par une seule porte : ce qu'on charge en premier finit au
                    fond. Donc le premier client livré se charge en dernier.
                  </p>
                  <ol className="flex flex-col gap-1">
                    {chargement.map(({ item, rangChargement, rangLivraison }) => (
                      <li key={item.id} className="flex items-center gap-2 text-[var(--fs-sm)]">
                        <span className="flex items-center justify-center w-6 h-6 shrink-0 rounded-full
                          bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--fs-xs)] font-bold text-[var(--text)]">
                          {rangChargement}
                        </span>
                        <span className="text-[var(--text)] truncate flex-1 min-w-0">{item.clients?.name ?? '—'}</span>
                        <span className="text-[var(--fs-xs)] text-[var(--text-muted)] shrink-0">
                          livré n° {rangLivraison}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border)] mt-3">
            <Button variant="primary" className="min-h-[44px]" onClick={handleDispatch}
              disabled={dispatching || !dispatchReady}
              title={!dispatchReady ? 'Coche au moins un véhicule et une livraison géocodée' : undefined}>
              {dispatching ? 'Répartition…' : 'Répartir & optimiser'}
            </Button>
            <Button variant="secondary" className="min-h-[44px]" onClick={handleRepartirDansMonOrdre}
              disabled={dispatching || !ordreReady}
              title={!ordreReady
                ? 'Coche UN seul véhicule et au moins une livraison'
                : undefined}>
              Répartir dans mon ordre
            </Button>
            <span className="text-[var(--fs-xs)] text-[var(--text-muted)] ml-auto">
              {selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}
            </span>
          </div>

          {/* Dire ce que chaque bouton fait à l'ordre, avant le clic et non après. */}
          <p className="text-[var(--fs-xs)] text-[var(--text-disabled)] mt-2">
            « Répartir & optimiser » recalcule l'ordre des arrêts (et donne distance et durée) :
            ton ordre sera remplacé. « Répartir dans mon ordre » garde exactement cette liste,
            sur un seul véhicule, sans calcul de distance.
          </p>
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

const inputCls = 'field'

const flecheCls = `p-2 rounded-[var(--r-md)] text-[var(--text-muted)]
  hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)]
  disabled:opacity-30 disabled:cursor-not-allowed transition-colors`

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="glass rounded-[var(--r-xl)] overflow-hidden">
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
