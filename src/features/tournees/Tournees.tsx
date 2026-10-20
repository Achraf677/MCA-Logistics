import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MapPin, AlertTriangle, ArrowUp, ArrowDown, PackageOpen, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { Badge } from '../../shared/ui/Badge'
import { Skeleton } from '../../shared/ui/Skeleton'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { useProfile, supabase } from '../../app/providers'
import { toLocalISO } from '../../shared/lib/dates'
import {
  getCompanyDepot, getActiveVehicles, getActiveDrivers,
  fetchPlannableDeliveries, getDeliveriesForDate, fetchToursByDate,
  dispatchAndOptimize, repartirDansMonOrdre,
  fetchLateDeliveries, replanifierRetardsAffectes, setRetraitAFaire, fetchStopsDesTournees,
} from './tournees.queries'
import {
  isGeocoded, canDispatch, groupToursWithStops, totalsAcrossTours,
  deplacerArret, planDeChargement,
  coursesEnRetard, fusionnerPool, estEnRetard, libelleRetard, dateDepuisParam,
  affectationsSuggerees, affectationsEcrasees,
  departInitial, urgentesDAbord, hhmm, DEPART_DEFAUT,
  type TourDeliveryAvecTournee,
} from './tournees.logic'
import { libelleCreneau } from '../livraisons/livraisons.logic'
import { TourCard, formatDuration } from './TourCard'
import { colorForIndex } from './tours.palette'
import type { OverviewTour } from './ToursOverviewMap'
import type { Tour, TourDelivery, Assignment, VehiculeTournee, ChauffeurTournee } from './tournees.types'
import { alertesAffectation } from '../../shared/lib/documentsAffectation'
import { TourneesColisDuJour } from './TourneesColisDuJour'

// Lazy-load : Leaflet hors bundle initial (chunk séparé).
const ToursOverviewMap = lazy(() => import('./ToursOverviewMap'))

export function Tournees() {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const { can } = usePermissions()
  const peutEcrire = can('planning.tournees', 'update')

  // `?date=AAAA-MM-JJ` (lien « Composer la tournée de ce jour » du Planning),
  // lu au montage seulement : ensuite, c'est le champ Date qui commande.
  const [params] = useSearchParams()
  const [date, setDate] = useState(() => dateDepuisParam(params.get('date')) ?? toLocalISO(new Date()))

  const [vehicles, setVehicles] = useState<VehiculeTournee[]>([])
  const [drivers, setDrivers]   = useState<ChauffeurTournee[]>([])
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
  /** Départ du dépôt envoyé à l'optimiseur (lot T3). */
  const [heureDepart, setHeureDepart] = useState(DEPART_DEFAUT)
  const [planOuvert, setPlanOuvert] = useState(false)

  const [loadingList, setLoadingList] = useState(false)
  // Mobile : une colonne à la fois (Préparer / Tournées). Sur PC les deux sont visibles.
  const [onglet, setOnglet] = useState<'preparer' | 'tournees'>('preparer')
  const [erreurChargement, setErreurChargement] = useState<string | null>(null)
  // Numéro de la dernière demande : une réponse plus lente d'une demande plus ancienne est ignorée.
  const demande = useRef(0)
  // Affectations reprises une fois par date (jamais par-dessus un choix fait à l'écran).
  const affectationsReprisesPour = useRef<string | null>(null)
  // Répartition en attente de confirmation (affectations existantes remplacées).
  const [aConfirmer, setAConfirmer] = useState<{ mode: 'ordre' | 'optimiser'; lignes: string[] } | null>(null)
  const [dispatching, setDispatching] = useState(false)
  const [unassignedCount, setUnassignedCount] = useState(0)

  // Résultat du dernier backfill géocodage — pour lister les adresses non résolues.
  const [geocodeReport, setGeocodeReport] =
    useState<{ echecs: string[]; depotMissingAddress: boolean } | null>(null)

  // ── Référentiels (une fois) ─────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return
    getCompanyDepot(companyId).then(({ data, error }) => {
      if (error) toast(`Dépôt non chargé : ${error.message}`, 'error')
      else if (data) setDepot({ lat: data.depot_lat, lng: data.depot_lng, name: data.name })
    })
    getActiveVehicles().then(({ data, error }) => {
      if (error) { toast(`Véhicules non chargés : ${error.message}`, 'error'); return }
      setVehicles((data ?? []).map(v => ({
        id: v.id, label: v.label, ct_expiry: v.ct_expiry, insurance_expiry: v.insurance_expiry,
      })))
    })
    getActiveDrivers().then(({ data, error }) => {
      if (error) { toast(`Chauffeurs non chargés : ${error.message}`, 'error'); return }
      setDrivers((data ?? []).map(d => ({
        id: d.id, label: d.full_name,
        licence_b_expiry: d.licence_b_expiry, medical_visit_expiry: d.medical_visit_expiry,
      })))
    })
  }, [companyId, toast])

  // ── Chargement : pool + livraisons + tournées de la date ─────────────────────
  // `garderLocal` : après un geste sur une carte ou une répartition, on garde l'ordre et la
  // sélection déjà faits à l'écran (seule la date remet tout à zéro).
  const charger = useCallback(async (garderLocal: boolean) => {
    if (!companyId) return
    const n = ++demande.current
    setLoadingList(true)
    // Retards : seulement si on compose aujourd'hui ou plus tard (replanifier
    // une course en retard vers une date passée n'aurait pas de sens).
    const aujourdHui = toLocalISO(new Date())
    const avecRetards = date >= aujourdHui
    const [poolRes, allRes, toursRes, retardsRes] = await Promise.all([
      fetchPlannableDeliveries(companyId, date),
      getDeliveriesForDate(companyId, date),
      fetchToursByDate(companyId, date),
      avecRetards ? fetchLateDeliveries(companyId, aujourdHui) : Promise.resolve({ data: [], error: null }),
    ])
    if (n !== demande.current) return
    const toursDuJour = (toursRes.data as unknown as Tour[]) ?? []
    // Arrêts des tournées lus par tournée : une course facturée ou déplacée reste dans la sienne.
    const stopsRes = toursRes.error ? { data: [], error: null } : await fetchStopsDesTournees(toursDuJour.map(t => t.id))
    if (n !== demande.current) return
    const echec = poolRes.error ?? allRes.error ?? toursRes.error ?? stopsRes.error
    if (echec) {
      setErreurChargement(echec.message)
      setLoadingList(false)
      return
    }
    setErreurChargement(null)
    if (retardsRes.error) toast(`Courses en retard non chargées : ${retardsRes.error.message}`, 'error')
    const retards = coursesEnRetard(
      (retardsRes.data as unknown as TourDeliveryAvecTournee[]) ?? [], aujourdHui,
    )
    // Urgentes en tête : c'est l'ordre proposé pour « mon ordre ».
    const poolList = urgentesDAbord(fusionnerPool((poolRes.data as unknown as TourDelivery[]) ?? [], retards))
    setPool(poolList)
    const idsPool = new Set(poolList.map(d => d.id))
    setOrdrePool(prev => {
      if (!garderLocal) return poolList.map(d => d.id)
      const gardes = prev.filter(id => idsPool.has(id))
      const connus = new Set(gardes)
      return [...gardes, ...poolList.filter(d => !connus.has(d.id)).map(d => d.id)]
    })
    const parId = new Map<string, TourDelivery>()
    for (const d of [...((allRes.data as unknown as TourDelivery[]) ?? []), ...((stopsRes.data as unknown as TourDelivery[]) ?? [])]) parId.set(d.id, d)
    const duJour = [...parId.values()]
    setAllDeliveries(duJour)
    setTours(toursDuJour)

    // Une seule saisie : chauffeur / véhicule déjà posés (tournées, Planning,
    // fiche) cochés et pré-remplis à l'ouverture de la date.
    if (affectationsReprisesPour.current !== date) {
      affectationsReprisesPour.current = date
      const sugg = affectationsSuggerees(toursDuJour, [...duJour, ...poolList])
      setSelectedVehicles(new Set(sugg.vehicules))
      setDriverByVehicle(sugg.chauffeurParVehicule)
      setHeureDepart(departInitial(toursDuJour))
    }

    // Pré-coche les géocodées non encore rattachées (tour_id null). Les retards
    // ne sont JAMAIS pré-cochés : les répartir change leur date, ça se décide.
    if (garderLocal) setSelectedIds(prev => new Set([...prev].filter(id => idsPool.has(id))))
    else setSelectedIds(new Set(
      poolList.filter(d => isGeocoded(d) && d.tour_id == null && !estEnRetard(d, date)).map(d => d.id),
    ))
    setLoadingList(false)
  }, [companyId, date, toast])

  useEffect(() => { void charger(false) }, [charger])
  const rechargerApresAction = useCallback(() => charger(true), [charger])

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
      await charger(true)
    } finally {
      setGeocoding(false)
    }
  }

  // ── Dérivés ──────────────────────────────────────────────────────────────────
  const depotGeocoded = depot.lat != null && depot.lng != null

  // Objet stable : sans ce useMemo, un nouveau `{ lat, lng }` est créé à CHAQUE
  // rendu de cet écran (cocher un véhicule, taper une date…), ce qui invalide
  // le React.memo de ToursOverviewMap et force la carte à se recadrer toute
  // seule à chaque interaction, même sans rapport avec elle.
  const depotPourCarte = useMemo(
    () => (depotGeocoded ? { lat: depot.lat as number, lng: depot.lng as number } : null),
    [depotGeocoded, depot.lat, depot.lng],
  )

  // Seuls les véhicules ACTIFS cochés comptent : une affectation reprise peut
  // viser un véhicule sorti de la flotte (jamais affiché, donc jamais envoyé).
  const vehiculesCoches = useMemo(
    () => [...selectedVehicles].filter(id => vehicles.some(v => v.id === id)),
    [selectedVehicles, vehicles],
  )

  const assignments: Assignment[] = useMemo(
    () => vehiculesCoches.map(vid => ({ vehicle_id: vid, driver_id: driverByVehicle[vid] || null })),
    [vehiculesCoches, driverByVehicle],
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

  const departValide = hhmm(heureDepart) !== ''
  const dispatchReady = canDispatch(assignments, selectedDeliveries) && departValide

  // « Répartir dans mon ordre » n'a de sens que sur UN véhicule : répartir sur
  // plusieurs, c'est exactement le travail de l'optimiseur, et un ordre unique
  // ne dit pas qui prend quoi.
  const vehiculeUnique = vehiculesCoches.length === 1 ? vehiculesCoches[0] : null
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
  /** Avant de répartir : dire quelles affectations déjà posées vont être remplacées. */
  const demander = (mode: 'ordre' | 'optimiser') => {
    const cibles = mode === 'ordre' && vehiculeUnique
      ? [{ vehicle_id: vehiculeUnique, driver_id: driverByVehicle[vehiculeUnique] || null }]
      : assignments
    const lignes: string[] = []
    const ecrasees = affectationsEcrasees(selectedDeliveries, cibles, mode)
    if (ecrasees.length > 0) {
      const noms = ecrasees.map(c => selectedDeliveries.find(d => d.id === c.id)?.clients?.name ?? '—')
      lignes.push(`${noms.length} course(s) ont déjà un autre chauffeur ou véhicule `
        + `(${noms.slice(0, 5).join(', ')}${noms.length > 5 ? '…' : ''}) : la répartition les remplace.`)
    }
    // Documents échus au jour de la tournée (même règle que le Planning).
    for (const a of cibles) {
      const v = vehicles.find(x => x.id === a.vehicle_id)
      const c = drivers.find(x => x.id === a.driver_id)
      lignes.push(...alertesAffectation(
        c ? { ...c, full_name: c.label } : null,
        v ?? null,
        date,
      ))
    }
    if (lignes.length > 0) {
      setAConfirmer({ mode, lignes })
      return
    }
    if (mode === 'ordre') void handleRepartirDansMonOrdre()
    else void handleDispatch()
  }

  const handleRepartirDansMonOrdre = async () => {
    if (!companyId || !vehiculeUnique || !ordreReady || dispatching) return
    setDispatching(true)
    const { error } = await repartirDansMonOrdre({
      companyId,
      date,
      vehicleId: vehiculeUnique,
      driverId: driverByVehicle[vehiculeUnique] || null,
      depotLat: depot.lat,
      depotLng: depot.lng,
      heureDepart: hhmm(heureDepart) || null,
      coursesDansLOrdre: selectedDeliveries,
    })
    setDispatching(false)
    if (error) { toast(error.message, 'error'); return }
    setUnassignedCount(0)
    toast(`${idsSelectionnesOrdonnes.length} livraison(s) rangée(s) dans ton ordre`)
    await charger(true)
  }

  const handleDispatch = async () => {
    if (!dispatchReady || dispatching) return
    setDispatching(true)
    try {
      const data = await dispatchAndOptimize(date, hhmm(heureDepart), assignments, idsSelectionnesOrdonnes)
      // L'Edge n'écrit pas `date` : les retards effectivement répartis sont
      // replanifiés ici au jour de la tournée.
      const idsRetard = selectedDeliveries.filter(d => estEnRetard(d, date)).map(d => d.id)
      const { error: replanErr } = await replanifierRetardsAffectes(idsRetard, date)
      if (replanErr) toast(`Tournée faite, mais date des courses en retard non mise à jour : ${replanErr.message}`, 'error')
      // Nombre renvoyé par l'Edge (pas une liste) : sans ça, l'avertissement ne s'affichait jamais.
      const un = typeof data.unassigned === 'number' ? data.unassigned : (data.unassigned?.length ?? 0)
      setUnassignedCount(un)
      toast(un > 0
        ? `Réparti — ${un} livraison(s) non réparties`
        : `${data.tours.length} tournée(s) réparties et optimisées`)
      if ((data.retraits_non_localises ?? 0) > 0) {
        toast(`${data.retraits_non_localises} adresse(s) de retrait introuvable(s) : ces courses partent du dépôt dans le calcul`, 'error')
      }
      await charger(true)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setDispatching(false)
    }
  }

  /** Retrait à faire, coché dès le pool (lot T4) : l'optimiseur en fait une paire retrait → livraison. */
  const [retraitBusy, setRetraitBusy] = useState<string | null>(null)
  const basculerRetraitPool = async (d: TourDelivery) => {
    setRetraitBusy(d.id)
    const { error } = await setRetraitAFaire(d.id, !d.retrait_a_faire)
    setRetraitBusy(null)
    if (error) { toast(error.message, 'error'); return }
    // Mise à jour locale : un rechargement complet perdrait l'ordre choisi.
    setPool(prev => prev.map(x => (x.id === d.id ? { ...x, retrait_a_faire: !d.retrait_a_faire } : x)))
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  const poolCount = pool.length
  const nonLocalisees = pool.filter(d => !isGeocoded(d)).length

  return (
    <Shell pageTitle="Tournées">
      <div className="flex flex-col gap-3 lg:h-[calc(100dvh-var(--topbar-h)-6.75rem)]">
      {/* Date, départ, chiffres du jour */}
      <div className="flex flex-wrap items-end gap-2 shrink-0">
        <div className="flex items-center gap-1">
          <BoutonIcone icone={ChevronLeft} libelle="Jour précédent" onClick={() => setDate(d => decalerJour(d, -1))} />
          <input type="date" value={date} aria-label="Date des tournées"
            onChange={e => { if (e.target.value) setDate(e.target.value) }} className={`${inputCls} !w-auto`} />
          <BoutonIcone icone={ChevronRight} libelle="Jour suivant" onClick={() => setDate(d => decalerJour(d, 1))} />
        </div>
        <Button variant="secondary" size="compact" onClick={() => setDate(toLocalISO(new Date()))}>Aujourd'hui</Button>
        <label className="flex items-center gap-2 text-sm text-[var(--text-muted)] ml-auto">
          Départ du dépôt
          <input type="time" value={heureDepart} onChange={e => setHeureDepart(e.target.value)}
            className={`${inputCls} !w-auto`} aria-invalid={!departValide} />
        </label>
      </div>
      <div className="flex gap-2 overflow-x-auto shrink-0 -mx-1 px-1 pb-0.5">
        <Tuile n={tours.length} libelle="tournées" />
        <Tuile n={grouped.reduce((n, g) => n + g.stops.length, 0)} libelle="courses en tournée" />
        <Tuile n={poolCount} libelle="à répartir" />
        <Tuile n={tours.length ? `${totals.totalKm.toFixed(0)} km` : '—'} libelle="distance" />
        <Tuile n={tours.length ? formatDuration(totals.totalMin) : '—'} libelle="durée" />
      </div>

      {erreurChargement && (
        <div role="alert" className="shrink-0 flex flex-wrap items-center gap-3 px-3 py-2.5 rounded-[var(--r-md)]
          bg-[var(--danger)]/10 border border-[var(--danger)]/30 text-sm">
          <AlertTriangle size={16} className="text-[var(--danger)] shrink-0" />
          <span className="flex-1 min-w-0 text-[var(--text)]">Chargement impossible : {erreurChargement}</span>
          <Button variant="secondary" size="compact" onClick={() => void charger(true)}>Réessayer</Button>
        </div>
      )}

      {/* Mobile : une colonne à la fois */}
      <div className="lg:hidden shrink-0 grid grid-cols-2 gap-1 p-1 rounded-[var(--r-md)] bg-[var(--bg-elevated)]" role="tablist">
        {([['preparer', 'Préparer'], ['tournees', `Tournées (${tours.length})`]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={onglet === k} onClick={() => setOnglet(k)}
            className={`min-h-10 rounded-[var(--r-sm)] text-sm font-medium transition-colors ${
              onglet === k ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)]'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* PC : préparation à gauche, carte et tournées à droite ; chaque colonne
          défile seule, l'écran tient sans faire défiler la page. */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:flex-1 lg:min-h-0 [&>*]:min-w-0 lg:[&>*]:min-h-0">

        {/* ── Colonne préparation ─────────────────────────────────────────── */}
        <div className={`${onglet === 'preparer' ? 'flex' : 'hidden'} lg:flex flex-col gap-3 lg:overflow-y-auto lg:pr-1 [&>*]:shrink-0`}>

          {/* Adresses non localisées — bouton de rattrapage 1-clic (Edge geocode). */}
          {(!depotGeocoded || nonLocalisees > 0) && (
            <div className="flex items-center gap-3 px-3 py-2 rounded-[var(--r-md)]
              bg-[var(--warning)]/10 border border-[var(--warning)]/30 text-sm">
              <AlertTriangle size={16} className="text-[var(--warning)] mt-0.5 shrink-0" />
              <span className="text-[var(--text-muted)] flex-1 min-w-0">
                {!depotGeocoded
                  ? 'Dépôt non localisé.'
                  : `${nonLocalisees} non localisée(s)`}
              </span>
              <Button variant="secondary" size="compact" onClick={handleBackfillGeocode} disabled={geocoding}>
                {geocoding ? 'Géocodage…' : 'Géocoder'}
              </Button>
            </div>
          )}

          {/* Rapport du dernier backfill — adresses non résolues (à corriger manuellement). */}
          {geocodeReport && (geocodeReport.echecs.length > 0 || geocodeReport.depotMissingAddress) && (
            <div className="flex flex-col gap-2 px-3 py-2.5 rounded-[var(--r-md)]
              bg-[var(--danger)]/10 border border-[var(--danger)]/30 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-[var(--danger)] mt-0.5 shrink-0" />
                <span className="text-[var(--text)] font-medium flex-1">
                  {geocodeReport.depotMissingAddress
                    ? "Adresse du dépôt manquante — renseigne-la dans Paramètres puis relance le géocodage."
                    : `${geocodeReport.echecs.length} adresse(s) non résolue(s) — corrige-les puis relance :`}
                </span>
                <button type="button" onClick={() => setGeocodeReport(null)}
                  className="text-[var(--text-muted)] hover:text-[var(--text)] text-xs">
                  Fermer
                </button>
              </div>
              {geocodeReport.echecs.length > 0 && (
                <ul className="list-disc pl-8 text-xs text-[var(--text-muted)] max-h-40 overflow-auto">
                  {geocodeReport.echecs.map((addr, i) => (
                    <li key={i} className="font-mono">{addr}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Véhicules & chauffeurs (affectations) */}
          <Section title={`Véhicules & chauffeurs (${vehiculesCoches.length} sélectionné${vehiculesCoches.length > 1 ? 's' : ''})`}>
            {vehicles.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] py-1">Aucun véhicule actif.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border)]">
                {vehicles.map(v => {
                  const checked = selectedVehicles.has(v.id)
                  return (
                    <li key={v.id} className="flex items-center gap-3 py-2">
                      <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                        <input type="checkbox" checked={checked} onChange={() => toggleVehicle(v.id)}
                          className="w-4 h-4 rounded accent-[var(--brand)] shrink-0" />
                        <span className="text-sm text-[var(--text)] truncate">{v.label}</span>
                      </label>
                      <select
                        value={driverByVehicle[v.id] ?? ''}
                        disabled={!checked}
                        onChange={e => setDriverByVehicle(p => ({ ...p, [v.id]: e.target.value }))}
                        className={`${inputCls} max-w-[13rem]`}
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
              <p className="text-sm text-[var(--text-muted)] py-3 text-center">
                Aucune livraison planifiée pour cette date, ni en retard.
              </p>
            ) : (
              <>
                <ul className="flex flex-col divide-y divide-[var(--border)]">
                  {poolOrdonne.map((d, i) => {
                    const geo = isGeocoded(d)
                    const coche = selectedIds.has(d.id)
                    // Numéro de livraison : compté parmi les cochées seulement,
                    // parce que seules celles-là partiront en tournée.
                    const rang = coche ? idsSelectionnesOrdonnes.indexOf(d.id) + 1 : null
                    const creneau = libelleCreneau(d.creneau_livraison_debut, d.creneau_livraison_fin)
                    return (
                      <li key={d.id} className="flex flex-wrap items-start gap-2 py-2">
                        <label className={`flex items-start gap-3 flex-1 min-w-0 ${geo ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                          <input type="checkbox" checked={coche} disabled={!geo}
                            onChange={() => toggleDelivery(d.id)}
                            className="w-4 h-4 mt-1 rounded accent-[var(--brand)] shrink-0" />
                          <span className={`flex items-center justify-center w-6 h-6 shrink-0 rounded-full text-xs font-bold
                            ${rang ? 'bg-[var(--brand-soft)] text-[var(--brand)]' : 'text-[var(--text-disabled)]'}`}>
                            {rang ?? '–'}
                          </span>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                              <span className="text-sm text-[var(--text)] truncate max-w-full">
                                {d.clients?.name ?? '—'}
                                {d.description && <span className="text-[var(--text-muted)]"> · {d.description}</span>}
                              </span>
                              {d.urgent && <Badge color="danger">Urgent</Badge>}
                              {creneau && <Badge color="muted">{creneau}</Badge>}
                              {estEnRetard(d, date) && <Badge color="danger">{libelleRetard(d.date)}</Badge>}
                              {d.statut === 'en_cours' && <Badge color="warning">En cours</Badge>}
                              {d.tour_id && (
                                <Badge color="info">
                                  Tournée {vehicleLabel(tours.find(t => t.id === d.tour_id)?.vehicle_id ?? null) ?? 'existante'}
                                </Badge>
                              )}
                            </span>
                            <span className="text-xs text-[var(--text-muted)] truncate">{d.delivery_address ?? '—'}</span>
                          </div>
                          {geo
                            ? <MapPin size={14} className="text-[var(--success)] shrink-0 mt-1" />
                            : <span className="text-xs text-[var(--text-disabled)] shrink-0">à géocoder</span>}
                        </label>
                        <span className="flex items-center shrink-0">
                          <button type="button" onClick={() => deplacerDansPool(d.id, 'haut')}
                            disabled={i === 0} aria-label="Monter cette livraison"
                            className={flecheCls}><ArrowUp size={15} /></button>
                          <button type="button" onClick={() => deplacerDansPool(d.id, 'bas')}
                            disabled={i === poolOrdonne.length - 1} aria-label="Descendre cette livraison"
                            className={flecheCls}><ArrowDown size={15} /></button>
                        </span>
                        {/* Retrait : coché à la main (la marchandise peut déjà être au dépôt). */}
                        {d.pickup_address && (
                          <label className="basis-full flex items-center gap-2 pl-16 cursor-pointer -mt-1">
                            <input type="checkbox" checked={d.retrait_a_faire}
                              onChange={() => basculerRetraitPool(d)} disabled={retraitBusy === d.id || !peutEcrire}
                              className="accent-[var(--brand)] w-4 h-4 cursor-pointer shrink-0" />
                            <span className="text-xs text-[var(--text-muted)] truncate">
                              Retrait à faire : {d.pickup_address}
                              {libelleCreneau(d.creneau_retrait_debut, d.creneau_retrait_fin)
                                && ` (${libelleCreneau(d.creneau_retrait_debut, d.creneau_retrait_fin)})`}
                            </span>
                          </label>
                        )}
                      </li>
                    )
                  })}
                </ul>

                {/* PLAN DE CHARGEMENT — l'inverse de l'ordre de livraison. Repliable. */}
                {chargement.length > 1 && (
                  <div className="mt-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-card)]">
                    <button type="button" onClick={() => setPlanOuvert(o => !o)} aria-expanded={planOuvert}
                      className="w-full flex items-center gap-2 px-3 min-h-10 text-left">
                      <PackageOpen size={15} className="text-[var(--brand)] shrink-0" />
                      <span className="text-sm font-medium text-[var(--text)] flex-1">Plan de chargement</span>
                      <ChevronDown size={16}
                        className={`text-[var(--text-muted)] shrink-0 transition-transform ${planOuvert ? 'rotate-180' : ''}`} />
                    </button>
                    {planOuvert && (
                      <div className="px-3 pb-3">
                        <p className="text-xs text-[var(--text-muted)] mb-2">
                          Un fourgon se vide par une seule porte : ce qu'on charge en premier finit au
                          fond. Donc le premier client livré se charge en dernier.
                        </p>
                        <ol className="flex flex-col gap-1">
                          {chargement.map(({ item, rangChargement, rangLivraison }) => (
                            <li key={item.id} className="flex items-center gap-2 text-sm">
                              <span className="flex items-center justify-center w-6 h-6 shrink-0 rounded-full
                                bg-[var(--bg-elevated)] border border-[var(--border)] text-xs font-bold text-[var(--text)]">
                                {rangChargement}
                              </span>
                              <span className="text-[var(--text)] truncate flex-1 min-w-0">{item.clients?.name ?? '—'}</span>
                              <span className="text-xs text-[var(--text-muted)] shrink-0">livré n° {rangLivraison}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border)] mt-3">
              <Button variant="primary" className="min-h-11" onClick={() => demander('optimiser')}
                disabled={dispatching || !dispatchReady || !peutEcrire}
                title={!departValide ? 'Heure de départ invalide'
                  : !dispatchReady ? 'Coche au moins un véhicule et une livraison géocodée' : undefined}>
                {dispatching ? 'Répartition…' : 'Répartir & optimiser'}
              </Button>
              <Button variant="secondary" className="min-h-11" onClick={() => demander('ordre')}
                disabled={dispatching || !ordreReady || !peutEcrire}
                title={!ordreReady ? 'Coche UN seul véhicule et au moins une livraison' : undefined}>
                Répartir dans mon ordre
              </Button>
              <span className="text-xs text-[var(--text-muted)] ml-auto">
                {selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}
              </span>
            </div>

          </Section>
        </div>

        {/* ── Colonne tournées ────────────────────────────────────────────── */}
        <div className={`${onglet === 'tournees' ? 'flex' : 'hidden'} lg:flex flex-col gap-3 lg:overflow-y-auto lg:pr-1 [&>*]:shrink-0`}>
          {/* Messagerie : feuilles de route scannées (hors deliveries, hors optimisation). */}
          {companyId && <TourneesColisDuJour companyId={companyId} date={date} />}

          {/* Avertissement non réparties */}
          {unassignedCount > 0 && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-[var(--r-md)]
              bg-[var(--warning)]/10 border border-[var(--warning)]/30 text-sm">
              <AlertTriangle size={16} className="text-[var(--warning)] mt-0.5 shrink-0" />
              <span className="text-[var(--text-muted)]">
                {unassignedCount} livraison(s) non réparties : capacité insuffisante, ou créneau
                impossible à tenir avec ce départ.
              </span>
            </div>
          )}

          {tours.length === 0 ? (
            <div className="glass rounded-[var(--r-xl)] p-6 text-center text-sm text-[var(--text-muted)]">
              Aucune tournée ce jour. Coche les véhicules et les livraisons, puis répartis.
            </div>
          ) : (
            <>
              {/* Carte d'ensemble — toutes les tournées, une couleur par véhicule */}
              {hasMapData && (
                <Suspense fallback={
                  <div className="h-[22rem] w-full rounded-[var(--r-lg)] border border-[var(--border)]
                    flex items-center justify-center text-sm text-[var(--text-muted)]">
                    Chargement de la carte…
                  </div>
                }>
                  <ToursOverviewMap tours={overviewTours} depot={depotPourCarte} />
                </Suspense>
              )}

              <div className="flex flex-col gap-3">
                {grouped.map((g, i) => (
                  <TourCard
                    key={g.tour.id}
                    tour={g.tour}
                    stops={g.stops}
                    vehicleLabel={vehicleLabel(g.tour.vehicle_id)}
                    driverLabel={driverLabel(g.tour.driver_id)}
                    color={colorForIndex(i)}
                    onChanged={rechargerApresAction}
                    peutEcrire={peutEcrire}
                    replie={grouped.length > 2}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      </div>

      <ConfirmDialog
        open={aConfirmer != null}
        title="Avant de répartir"
        message={aConfirmer ? aConfirmer.lignes.join(' · ') : ''}
        confirmLabel="Répartir quand même"
        onConfirm={() => {
          const mode = aConfirmer?.mode
          setAConfirmer(null)
          if (mode === 'ordre') void handleRepartirDansMonOrdre()
          else if (mode === 'optimiser') void handleDispatch()
        }}
        onCancel={() => setAConfirmer(null)}
        loading={dispatching}
      />
    </Shell>
  )
}

// ── Sous-composants ────────────────────────────────────────────────────────────

const inputCls = 'field'

/** 'AAAA-MM-JJ' décalé de n jours (local, sans passer par UTC). */
function decalerJour(iso: string, n: number): string {
  const [a, m, j] = iso.split('-').map(Number)
  return toLocalISO(new Date(a, m - 1, j + n))
}

function Tuile({ n, libelle }: { n: string | number; libelle: string }) {
  return (
    <div className="shrink-0 min-w-[5.5rem] flex-1 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5">
      <p className="text-xl font-bold tabular-nums leading-tight text-[var(--text)]">{n}</p>
      <p className="text-xs text-[var(--text-muted)] truncate">{libelle}</p>
    </div>
  )
}

const flecheCls = `min-w-10 min-h-10 inline-flex items-center justify-center rounded-[var(--r-md)] text-[var(--text-muted)]
  hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)]
  disabled:opacity-30 disabled:cursor-not-allowed transition-colors`

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="glass rounded-[var(--r-xl)] overflow-hidden">
      <div className="px-4 py-2 bg-[var(--bg-elevated)] border-b border-[var(--border)]">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">{title}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}
