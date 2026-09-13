import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Route, Navigation2, ExternalLink, Check, Clock, Fuel, Truck, User, ArrowUp, ArrowDown, PackageOpen, ChevronDown } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { formatMoney } from '../../shared/lib/money'
// Machine d'états unique (réutilisée, pas dupliquée).
import { canTransition } from '../livraisons/livraisons.logic'
import { markDelivered, setTourStatus, updateTour, setRetraitAFaire, enregistrerOrdreArrets } from './tournees.queries'
import {
  estimateFuelCostCts, googleMapsStopUrl, wazeUrl, googleMapsRouteUrl,
  googleMapsAdresseUrl, wazeAdresseUrl, deplacerArret, planDeChargement,
  type NavOptions,
  isDelivered, deliveredProgress, hasUndeliveredStops, canStartTour, canFinishTour,
} from './tournees.logic'
import type { Tour, TourDelivery, TourStatus } from './tournees.types'

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
  /** Couleur de la tournée (cohérente avec la carte d'ensemble). */
  color?: string
  /** Appelé après une modification (livré, démarrer, terminer) pour recharger. */
  onChanged: () => void | Promise<void>
}

/**
 * Rendu exploitable d'UNE tournée : en-tête véhicule/chauffeur, totaux,
 * liste d'arrêts ordonnés (navigation GPS + suivi « Livré »), cycle de vie.
 * La carte est désormais globale (ToursOverviewMap), plus de mini-carte ici.
 * Comportement (hors carte) identique au mono v2. Pensé mobile.
 */
export function TourCard({ tour, stops, vehicleLabel, driverLabel, color, onChanged }: Props) {
  const { toast } = useToast()
  const [stopBusy, setStopBusy] = useState<string | null>(null)
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [ordreBusy, setOrdreBusy] = useState(false)
  // Replie par defaut : le plan sert au depot, avant de partir, pas pendant
  // la tournee. L'ouvrir d'office pousserait la liste des arrets hors ecran.
  const [planOuvert, setPlanOuvert] = useState(false)

  /**
   * Remonte ou descend un arret, puis enregistre l'ordre complet.
   *
   * L'optimisation calcule le trajet le plus court ; elle ignore les
   * contraintes du terrain — un client qui n'ouvre qu'a 14 h, un chargement a
   * prendre avant une livraison, un acces interdit le matin. Cet ordre-la,
   * c'est l'humain qui le pose.
   */
  const deplacer = async (id: string, sens: 'haut' | 'bas') => {
    const ids = stops.map(s => s.id)
    const nouveau = deplacerArret(ids, id, sens)
    // `deplacerArret` renvoie le tableau inchange quand le mouvement est
    // impossible : on ne va pas ecrire en base pour rien.
    if (nouveau.every((v, i) => v === ids[i])) return
    setOrdreBusy(true)
    const { error } = await enregistrerOrdreArrets(nouveau)
    setOrdreBusy(false)
    if (error) { toast(error.message, 'error'); return }
    await onChanged()
  }

  const basculerRetrait = async (s: TourDelivery) => {
    setStopBusy(s.id)
    const { error } = await setRetraitAFaire(s.id, !s.retrait_a_faire)
    setStopBusy(null)
    if (error) { toast(error.message, 'error'); return }
    await onChanged()
  }

  const depotGeocoded = tour.depot_lat != null && tour.depot_lng != null
  const fuelCts = estimateFuelCostCts(tour.total_km)
  const progress = deliveredProgress(stops)
  const undeliveredCount = stops.filter(s => !isDelivered(s)).length

  // Arrêts géocodés, pour le lien « Itinéraire complet ».
  const geoStops = stops
    .filter(s => s.delivery_lat != null && s.delivery_lng != null)
    .map(s => ({ stop_order: s.stop_order, lat: s.delivery_lat as number, lng: s.delivery_lng as number }))

  // Option de navigation portee par la tournee. Elle n'agit que sur les liens
  // externes : l'optimisation de l'ordre des arrets ne sait pas eviter les
  // peages (cf. NavOptions dans tournees.logic.ts).
  // Etat local pour que la case reponde tout de suite, la base restant la
  // reference — en cas d'echec on revient a la valeur precedente.
  const [eviterPeages, setEviterPeages] = useState(tour.eviter_peages ?? false)
  const [peagesBusy, setPeagesBusy] = useState(false)
  useEffect(() => { setEviterPeages(tour.eviter_peages ?? false) }, [tour.eviter_peages])

  const navOpts: NavOptions = { eviterPeages }

  const handleEviterPeages = async (coche: boolean) => {
    setEviterPeages(coche)
    setPeagesBusy(true)
    const { error } = await updateTour(tour.id, { eviter_peages: coche })
    setPeagesBusy(false)
    if (error) {
      setEviterPeages(!coche)
      toast(error.message, 'error')
      return
    }
    await onChanged()
  }

  const routeUrl = googleMapsRouteUrl(
    depotGeocoded ? { lat: tour.depot_lat as number, lng: tour.depot_lng as number } : null,
    geoStops,
    navOpts,
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
        {color
          ? <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} aria-hidden />
          : <Truck size={16} className="text-[var(--brand)] shrink-0" />}
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
          {canStartTour(tour.status, stops.length) && (
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

        {/* Éviter les péages — agit sur les liens de navigation de cette tournée.
            Le libellé dit explicitement ce que ça ne fait pas : promettre que
            l'ordre des arrêts en tiendrait compte serait faux. */}
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={eviterPeages}
            onChange={e => handleEviterPeages(e.target.checked)}
            disabled={peagesBusy}
            className="accent-[var(--brand)] w-4 h-4 mt-0.5 shrink-0 cursor-pointer"
          />
          <span className="text-[var(--fs-sm)] text-[var(--text)]">
            Éviter les péages
            <span className="block text-[var(--fs-xs)] text-[var(--text-muted)]">
              S'applique aux liens Maps et Waze de cette tournée, pas à l'ordre des arrêts.
            </span>
          </span>
        </label>

        {/* Deux limites qu'il vaut mieux lire ici que decouvrir en route. */}
        {stops.length > 1 && (
          <p className="text-[var(--fs-xs)] text-[var(--text-disabled)]">
            Les flèches imposent ton ordre. Relancer l'optimisation le remplacera.
            {stops.some(s => s.retrait_a_faire) && " Les retraits ne figurent pas dans « Itinéraire complet » : ils n'ont pas de coordonnées, seulement une adresse."}
          </p>
        )}

        {/* PLAN DE CHARGEMENT — l'inverse de l'ordre de livraison.
            Repliable : il sert une fois, au dépôt, avant de partir. */}
        {stops.length > 1 && (
          <div className="mt-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-card)]">
            <button type="button" onClick={() => setPlanOuvert(o => !o)}
              aria-expanded={planOuvert}
              className="w-full flex items-center gap-2 px-3 min-h-[44px] text-left">
              <PackageOpen size={15} className="text-[var(--brand)] shrink-0" />
              <span className="text-[var(--fs-sm)] font-medium text-[var(--text)] flex-1">
                Plan de chargement
              </span>
              <ChevronDown size={16}
                className={`text-[var(--text-muted)] shrink-0 transition-transform ${planOuvert ? 'rotate-180' : ''}`} />
            </button>
            {planOuvert && (
              <div className="px-3 pb-3">
                <p className="text-[var(--fs-xs)] text-[var(--text-muted)] mb-2">
                  Un fourgon se vide par une seule porte : ce qu'on charge en premier finit au
                  fond. Le premier client livré se charge donc en dernier, contre la porte.
                </p>
                <ol className="flex flex-col gap-1">
                  {planDeChargement(stops).map(({ item, rangChargement, rangLivraison }) => (
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
          </div>
        )}

        {/* Liste ordonnée — mobile-first */}
        <ol className="flex flex-col">
          {stops.map((s, i) => {
            const delivered = isDelivered(s)
            const geo = s.delivery_lat != null && s.delivery_lng != null
            return (
              <li key={s.id}
                className={`flex flex-col gap-2 py-3 border-b border-[var(--border)] last:border-0 ${delivered ? 'opacity-60' : ''}`}>

                {/* Arret de RETRAIT, quand la course en demande un. Affiche
                    AVANT la livraison parce que c'est l'ordre du terrain : on
                    charge, puis on livre. Pas de coordonnees pour un retrait —
                    `deliveries` ne geocode que l'adresse de livraison — donc
                    les liens partent sur l'adresse ecrite. */}
                {s.retrait_a_faire && s.pickup_address && (
                  <div className="flex items-start gap-3 pb-2">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full shrink-0
                      bg-[var(--warning)]/15 text-[var(--warning)]">
                      <PackageOpen size={14} />
                    </span>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[var(--fs-xs)] font-medium text-[var(--warning)]">Retrait</span>
                      <span className="text-[var(--fs-sm)] text-[var(--text)] break-words">{s.pickup_address}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <a href={googleMapsAdresseUrl(s.pickup_address, navOpts)}
                          target="_blank" rel="noopener noreferrer" className={linkBtnCls}>
                          <Navigation2 size={14} /> Naviguer
                        </a>
                        <a href={wazeAdresseUrl(s.pickup_address)}
                          target="_blank" rel="noopener noreferrer"
                          className="text-[var(--fs-xs)] text-[var(--text-muted)] underline px-1 py-2">
                          Waze
                        </a>
                      </div>
                    </div>
                  </div>
                )}

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

                {/* Case de retrait : seulement s'il y a une adresse ou aller.
                    Cochee a la main et jamais deduite — une adresse de retrait
                    renseignee ne dit pas si la marchandise est encore la-bas
                    ou deja chargee au depot. */}
                {!delivered && s.pickup_address && (
                  <label className="flex items-center gap-2 pl-10 cursor-pointer">
                    <input type="checkbox" checked={s.retrait_a_faire}
                      onChange={() => basculerRetrait(s)}
                      disabled={stopBusy === s.id}
                      className="accent-[var(--brand)] w-4 h-4 cursor-pointer" />
                    <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                      Passer par l'adresse de retrait
                    </span>
                  </label>
                )}

                <div className="flex items-center gap-2 pl-10">
                  {/* Ordre impose a la main. Une re-optimisation l'ecrasera :
                      c'est voulu, sinon « optimiser » ne voudrait plus rien
                      dire. L'en-tete de la liste le rappelle. */}
                  {!delivered && stops.length > 1 && (
                    <span className="flex items-center gap-1">
                      <button onClick={() => deplacer(s.id, 'haut')}
                        disabled={ordreBusy || i === 0}
                        aria-label="Monter cet arrêt"
                        className="p-2 rounded-[var(--r-md)] text-[var(--text-muted)]
                          hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)]
                          disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                        <ArrowUp size={15} />
                      </button>
                      <button onClick={() => deplacer(s.id, 'bas')}
                        disabled={ordreBusy || i === stops.length - 1}
                        aria-label="Descendre cet arrêt"
                        className="p-2 rounded-[var(--r-md)] text-[var(--text-muted)]
                          hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)]
                          disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                        <ArrowDown size={15} />
                      </button>
                    </span>
                  )}
                  {geo && (
                    <>
                      <a href={googleMapsStopUrl(s.delivery_lat as number, s.delivery_lng as number, navOpts)}
                        target="_blank" rel="noopener noreferrer" className={linkBtnCls}>
                        <Navigation2 size={14} /> Naviguer
                      </a>
                      <a href={wazeUrl(s.delivery_lat as number, s.delivery_lng as number, navOpts)}
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
          Estimation à 0,15 €/km.
        </p>
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
