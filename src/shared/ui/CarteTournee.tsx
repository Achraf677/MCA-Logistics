// Carte d'une ou plusieurs tournées de colis (lot 2), partagée : Ma tournée (livreur) et
// « Carte du jour » (bureau). À charger en différé (`lazy(() => import('…/CarteTournee'))`) :
// Leaflet ne pèse que quand on ouvre la carte. Seules les TUILES viennent du navigateur
// (Plan IGN v2, sans clé) ; aucun calcul d'itinéraire ici (Edge `optimiser-tournee-colis`).
//
// Pastilles : numéro de passage, couleur = état (à faire = accent, livré = vert, attente =
// orange, retour = rouge, non placé dans l'ordre = gris pointillé), picto relais / collecte,
// prochain arrêt plus gros, « ×n » quand plusieurs arrêts au même point. Tracé restant plein,
// tracé fait estompé. « Ma position » (livreur) reste sur le téléphone : rien n'est envoyé ici.
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Circle, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import polyline from '@mapbox/polyline'
import 'leaflet/dist/leaflet.css'
import { LocateFixed, Maximize2, X } from 'lucide-react'
import { couperTrace, pointsCarte, type EtatMarqueur, type PointCarte } from '../lib/tourneesColisRoute'
import type { ArretColis, OrdreMode, TrajetTournee } from '../lib/tourneesColis'

const TUILES = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2'
  + '&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png'
const CENTRE_DEFAUT: [number, number] = [48.58, 7.75]

const COULEUR_ETAT: Record<EtatMarqueur, string> = {
  a_faire: 'var(--brand)', livre: 'var(--success)', attente: 'var(--warning)', retour: 'var(--danger)', neutre: 'var(--text-muted)',
}

// Pictos lucide (Store, PackagePlus) en SVG brut : une divIcon Leaflet prend du HTML.
const SVG = (d: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
const PICTO = {
  rc: SVG('<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-2-1 2.7 2.7 0 0 1-4 0 2.7 2.7 0 0 1-4 0 2.7 2.7 0 0 1-4 0 2.7 2.7 0 0 1-2 1 2 2 0 0 1-2-2V7"/>'),
  col: SVG('<path d="M16 16h6"/><path d="M19 13v6"/><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="M3.29 7 12 12l8.71-5"/><path d="M12 22V12"/>'),
  depot: SVG('<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><rect width="12" height="12" x="6" y="10"/>'),
  camion: SVG('<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>'),
}

/** Cache des icônes : une par (numéro × état × options), jamais reconstruite à chaque rendu. */
const cacheIcones = new Map<string, L.DivIcon>()
function icone(p: PointCarte, couleur: string | null): L.DivIcon {
  const fond = p.horsOrdre ? '#9ca3af' : couleur && p.etat === 'a_faire' ? couleur : COULEUR_ETAT[p.etat]
  const taille = p.prochain ? 2.75 : 2
  const cle = `${p.numero}|${p.etat}|${p.horsOrdre}|${p.prochain}|${p.type}|${p.arrets.length}|${fond}`
  let ic = cacheIcones.get(cle)
  if (!ic) {
    const px = taille * 14
    const traite = p.etat !== 'a_faire'
    const html = `<div style="position:relative;width:${taille}rem;height:${taille}rem;border-radius:50%;background:${fond};
      color:${p.etat === 'livre' || p.etat === 'attente' ? '#111' : '#fff'};display:flex;align-items:center;justify-content:center;
      font:700 ${p.prochain ? 1.05 : 0.9}rem/1 system-ui;border:${p.horsOrdre ? '2px dashed #fff' : '2px solid #fff'};
      box-shadow:0 1px 4px rgba(0,0,0,.5);opacity:${traite && !couleur ? 0.85 : traite ? 0.45 : 1}">
      ${p.numero ?? '?'}
      ${p.type !== 'c' ? `<span style="position:absolute;left:-0.35rem;top:-0.35rem;width:1.1rem;height:1.1rem;border-radius:50%;background:#111;color:#fff;display:flex;align-items:center;justify-content:center">${PICTO[p.type]}</span>` : ''}
      ${p.arrets.length > 1 ? `<span style="position:absolute;right:-0.45rem;bottom:-0.35rem;min-width:1.1rem;padding:0 0.2rem;height:1.1rem;border-radius:0.55rem;background:#111;color:#fff;font:700 0.7rem/1.1rem system-ui;text-align:center">×${p.arrets.length}</span>` : ''}
    </div>`
    ic = L.divIcon({ className: 'mca-arret-colis', html, iconSize: [px, px], iconAnchor: [px / 2, px / 2] })
    cacheIcones.set(cle, ic)
  }
  return ic
}

const ICONE_DEPART = L.divIcon({
  className: 'mca-depart', iconSize: [30, 30], iconAnchor: [15, 15],
  html: `<div style="width:30px;height:30px;border-radius:8px;background:#1f2937;color:#fff;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)">${PICTO.depot.replace(/width="11" height="11"/, 'width="16" height="16"')}</div>`,
})

const cacheCamions = new Map<string, L.DivIcon>()
function iconeCamion(couleur: string, ancien: boolean): L.DivIcon {
  const cle = `${couleur}|${ancien}`
  let ic = cacheCamions.get(cle)
  if (!ic) {
    ic = L.divIcon({
      className: 'mca-livreur', iconSize: [34, 34], iconAnchor: [17, 17],
      html: `<div style="width:34px;height:34px;border-radius:50%;background:${couleur};color:#fff;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.6);opacity:${ancien ? 0.5 : 1}">${PICTO.camion.replace(/width="11" height="11"/, 'width="18" height="18"')}</div>`,
    })
    cacheCamions.set(cle, ic)
  }
  return ic
}

export interface CoucheTournee {
  id: string
  /** Couleur du salarié (bureau) ; null = couleurs d'état seulement (livreur). */
  couleur: string | null
  arrets: ArretColis[]
  mode: OrdreMode
  trajet: TrajetTournee | null
  prochainId: string | null
}

export interface PositionAffichee {
  id: string
  lat: number
  lng: number
  couleur: string
  libelle: string
  ancien: boolean
}

interface Props {
  couches: CoucheTournee[]
  /** Classe de hauteur (rem). */
  hauteur?: string
  /** Livreur : « Ma position » (GPS du téléphone, jamais envoyé par la carte). */
  maPosition?: boolean
  /** Remonte la position du téléphone (recalcul depuis ma position, distance au prochain). */
  onPosition?: (p: { lat: number; lng: number; precision: number }) => void
  /** Bureau : dernières positions partagées. */
  positions?: PositionAffichee[]
  onPoint?: (p: PointCarte, coucheId: string) => void
  /** Mode placement : toucher la carte place l'arrêt. */
  placement?: { libelle: string; onPlacer: (pos: { lat: number; lng: number }) => void; onAnnuler: () => void } | null
  /** Panneau du bas (gestes de l'arrêt touché), rendu par l'écran appelant. */
  panneau?: ReactNode
  onFermerPanneau?: () => void
}

function Cadrage({ positions, demande }: { positions: [number, number][]; demande: number }) {
  const map = useMap()
  const fait = useRef(-1)
  useEffect(() => {
    if (fait.current === demande || positions.length === 0) return
    fait.current = demande
    if (positions.length === 1) map.setView(positions[0], 16)
    else map.fitBounds(L.latLngBounds(positions), { padding: [32, 32], maxZoom: 17 })
  }, [map, positions, demande])
  return null
}

function Recentrer({ cible, demande }: { cible: [number, number] | null; demande: number }) {
  const map = useMap()
  useEffect(() => {
    if (demande > 0 && cible) map.setView(cible, Math.max(map.getZoom(), 16))
  }, [map, demande]) // eslint-disable-line react-hooks/exhaustive-deps -- recentrer seulement sur demande
  return null
}

function Clic({ onClic }: { onClic: (pos: { lat: number; lng: number }) => void }) {
  useMapEvents({ click: e => onClic({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

const boutonCarte = 'w-11 h-11 inline-flex items-center justify-center rounded-[var(--r-md)] bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border-strong)] shadow'

function CarteTournee({ couches, hauteur = 'h-[60vh] min-h-[22rem]', maPosition, onPosition, positions, onPoint, placement, panneau, onFermerPanneau }: Props) {
  const [moi, setMoi] = useState<{ lat: number; lng: number; precision: number } | null>(null)
  const [gpsRefus, setGpsRefus] = useState(false)
  const [cadrage, setCadrage] = useState(0)
  const [recentrer, setRecentrer] = useState(0)
  const onPositionRef = useRef(onPosition)
  useEffect(() => { onPositionRef.current = onPosition }, [onPosition])

  useEffect(() => {
    if (!maPosition || !('geolocation' in navigator)) return
    const id = navigator.geolocation.watchPosition(
      p => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }
        setMoi(pos); setGpsRefus(false); onPositionRef.current?.(pos)
      },
      () => setGpsRefus(true),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [maPosition])

  const calques = useMemo(() => couches.map(c => {
    const points = pointsCarte(c.arrets, c.mode, c.prochainId)
    const ligne = c.trajet?.polyline ? (polyline.decode(c.trajet.polyline) as Array<[number, number]>) : []
    const prochain = c.arrets.find(a => a.id === c.prochainId)
    const toutFait = c.arrets.length > 0 && c.arrets.every(a => !!a.statut)
    const trace = couperTrace(ligne, prochain?.lat != null && prochain.lng != null ? { lat: prochain.lat, lng: prochain.lng } : null, toutFait)
    return { ...c, points, trace }
  }), [couches])

  const tous = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = []
    for (const c of calques) {
      for (const p of c.points) pts.push([p.lat, p.lng])
      if (c.trajet?.depart) pts.push([c.trajet.depart.lat, c.trajet.depart.lng])
    }
    for (const p of positions ?? []) pts.push([p.lat, p.lng])
    return pts
  }, [calques, positions])

  const departs = useMemo(() => {
    const vus = new Map<string, { lat: number; lng: number; retour: boolean }>()
    for (const c of calques) {
      const d = c.trajet?.depart
      if (d) vus.set(`${d.lat.toFixed(4)},${d.lng.toFixed(4)}`, { ...d, retour: c.trajet?.arrivee === 'depart' })
    }
    return [...vus.values()]
  }, [calques])

  return (
    <div className={`relative isolate rounded-[var(--r-lg)] overflow-hidden border border-[var(--border)] ${hauteur}`}>
      {/* keyboard={false} : sinon Leaflet donne le focus à la carte au toucher, la page (qui défile
          dans un conteneur, pas la fenêtre) saute, et la pastille touchée n'est plus sous le doigt. */}
      <MapContainer center={tous[0] ?? CENTRE_DEFAUT} zoom={13} scrollWheelZoom zoomControl={false} keyboard={false}
        style={{ height: '100%', width: '100%' }}>
        <TileLayer url={TUILES} maxZoom={19} attribution='&copy; <a href="https://www.ign.fr/">IGN</a>' />
        {calques.map(c => c.trace.fait.length > 1 && (
          <Polyline key={`${c.id}-fait`} positions={c.trace.fait}
            pathOptions={{ color: c.couleur ?? '#6b7280', weight: 4, opacity: 0.35, dashArray: '6 8' }} />
        ))}
        {calques.map(c => c.trace.reste.length > 1 && (
          <Polyline key={`${c.id}-reste`} positions={c.trace.reste}
            pathOptions={{ color: c.couleur ?? '#2563eb', weight: 5, opacity: 0.85 }} />
        ))}
        {departs.map(d => (
          <Marker key={`dep-${d.lat}-${d.lng}`} position={[d.lat, d.lng]} icon={ICONE_DEPART} zIndexOffset={-1000}>
            <Tooltip direction="top" offset={[0, -14]}>{d.retour ? 'Départ et retour' : 'Départ'}</Tooltip>
          </Marker>
        ))}
        {calques.flatMap(c => c.points.map(p => (
          <Marker key={`${c.id}-${p.cle}`} position={[p.lat, p.lng]} icon={icone(p, c.couleur)}
            zIndexOffset={p.prochain ? 1000 : p.etat === 'a_faire' ? -(p.numero ?? 999) : -2000}
            eventHandlers={{ click: () => onPoint?.(p, c.id) }} />
        )))}
        {(positions ?? []).map(p => (
          <Marker key={`pos-${p.id}`} position={[p.lat, p.lng]} icon={iconeCamion(p.couleur, p.ancien)} zIndexOffset={2000}>
            <Tooltip direction="top" offset={[0, -16]} permanent>{p.libelle}</Tooltip>
          </Marker>
        ))}
        {moi && (
          <>
            <Circle center={[moi.lat, moi.lng]} radius={Math.min(moi.precision, 500)}
              pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: 0.12 }} />
            <CircleMarker center={[moi.lat, moi.lng]} radius={8}
              pathOptions={{ color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }} />
          </>
        )}
        {placement && <Clic onClic={placement.onPlacer} />}
        <Cadrage positions={tous} demande={cadrage} />
        <Recentrer cible={moi ? [moi.lat, moi.lng] : null} demande={recentrer} />
      </MapContainer>

      <div className="absolute right-2 top-2 z-[500] flex flex-col gap-2">
        {maPosition && (
          <button type="button" className={boutonCarte} onClick={() => setRecentrer(n => n + 1)} disabled={!moi}
            aria-label="Recentrer sur ma position" title="Recentrer sur ma position">
            <LocateFixed size={20} />
          </button>
        )}
        <button type="button" className={boutonCarte} onClick={() => setCadrage(n => n + 1)}
          aria-label="Voir toute la tournée" title="Voir toute la tournée">
          <Maximize2 size={20} />
        </button>
      </div>

      {maPosition && gpsRefus && !moi && (
        <p className="absolute left-2 top-2 z-[500] max-w-[70%] px-2 py-1 rounded-[var(--r-md)] bg-[var(--bg-card)] text-xs text-[var(--text-muted)] border border-[var(--border)]">
          Position indisponible : autorise la localisation pour ce site.
        </p>
      )}

      {placement && (
        <div className="absolute inset-x-2 top-2 z-[600] flex items-center gap-2 p-2 pr-14 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--brand)] shadow">
          <p className="flex-1 min-w-0 text-sm text-[var(--text)]">Touche la carte à l'endroit de : <strong>{placement.libelle}</strong></p>
          <button type="button" className={boutonCarte} onClick={placement.onAnnuler} aria-label="Annuler le placement">
            <X size={18} />
          </button>
        </div>
      )}

      {panneau && (
        <div className="absolute inset-x-0 bottom-0 z-[600] max-h-[70%] overflow-y-auto p-2 pt-0">
          <div className="relative flex flex-col gap-2 p-2 pt-10 rounded-[var(--r-lg)] bg-[var(--bg)] border border-[var(--border-strong)] shadow-lg">
            {onFermerPanneau && (
              <button type="button" onClick={onFermerPanneau} aria-label="Fermer"
                className="absolute right-1 top-1 w-11 h-9 inline-flex items-center justify-center text-[var(--text-muted)]">
                <X size={18} />
              </button>
            )}
            {panneau}
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(CarteTournee)
