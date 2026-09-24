import { useEffect, useMemo, memo } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import polyline from '@mapbox/polyline'
import 'leaflet/dist/leaflet.css'
import { formatDuration } from './TourCard'

const DEPOT_COLOR = '#1f2937'

export interface OverviewTour {
  id: string
  geometry: string | null
  color: string
  vehicleLabel: string
  totalKm: number | null
  totalMin: number | null
  stops: { stop_order: number | null; lat: number; lng: number }[]
}

interface Props {
  tours: OverviewTour[]
  depot: { lat: number; lng: number } | null
}

// ── Icônes custom (L.divIcon) — pas de PNG par défaut (cassés avec Vite). ──────

function pin(html: string): L.DivIcon {
  return L.divIcon({ className: 'mca-tour-pin', html, iconSize: [24, 24], iconAnchor: [12, 12] })
}

/**
 * Pastille numerotee d'un arret.
 *
 * `n` est un RANG (1, 2, 3…), jamais `stop_order` brut : il ne peut donc plus
 * etre absent, et la carte se lit comme un itineraire sans trou.
 *
 * MISE EN CACHE : sans elle, une `L.divIcon` est reconstruite pour CHAQUE
 * marqueur a CHAQUE rendu du composant — donc a chaque clic n'importe ou sur
 * la page, Leaflet doit reappliquer `setIcon()` sur tous les marqueurs. Le
 * cache est fini (un numero x une couleur x une tournee), jamais assez grand
 * pour peser en memoire.
 */
const stopIconCache = new Map<string, L.DivIcon>()
function stopIcon(n: number, color: string): L.DivIcon {
  const cle = `${n}|${color}`
  let icone = stopIconCache.get(cle)
  if (!icone) {
    icone = pin(
      `<div style="width:24px;height:24px;border-radius:50%;background:${color};
        color:#fff;font:700 11px/24px system-ui;text-align:center;
        border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${n}</div>`,
    )
    stopIconCache.set(cle, icone)
  }
  return icone
}

// Icone unique, toujours la meme : calculee une seule fois au chargement du module.
const DEPOT_ICON = pin(
  `<div style="width:26px;height:26px;border-radius:50%;background:${DEPOT_COLOR};
    color:#fff;font:700 12px/26px system-ui;text-align:center;
    border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">D</div>`,
)

// ── Recadrage automatique sur tous les tracés + arrêts + dépôt ─────────────────

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length === 0) return
    if (positions.length === 1) { map.setView(positions[0], 14); return }
    map.fitBounds(L.latLngBounds(positions), { padding: [40, 40] })
  }, [map, positions])
  return null
}

// React.memo : sans lui, ce composant se redessine a chaque rendu du parent —
// donc a chaque clic n'importe ou sur l'ecran Tournees — meme quand ni les
// tournees ni le depot n'ont change. C'est ce qui donnait l'impression que la
// carte "saute" a chaque interaction.
function ToursOverviewMap({ tours, depot }: Props) {
  // Décodage des polylines (précision 5 par défaut, ORS/Google).
  const decoded = useMemo(
    () => tours.map(t => ({
      ...t,
      line: t.geometry ? (polyline.decode(t.geometry) as [number, number][]) : [],
      /**
       * Arrets TRIES, et numerotes par leur RANG et non par `stop_order` brut.
       *
       * Deux corrections en une. D'abord l'ordre : les arrets arrivaient dans
       * l'ordre de la requete, donc un « 3 » pouvait se dessiner avant un
       * « 1 » — invisible sur la carte, sauf quand deux pastilles se
       * superposent et que la mauvaise passe devant. Ensuite le numero : un
       * arret sans `stop_order` affichait « • », et une tournee composee a la
       * main pouvait donc montrer 1, •, 3. La carte doit se lire comme un
       * itineraire : 1, 2, 3, sans trou.
       */
      stopsOrdonnes: [...t.stops]
        .sort((a, b) => (a.stop_order ?? Number.MAX_SAFE_INTEGER) - (b.stop_order ?? Number.MAX_SAFE_INTEGER))
        .map((s, i) => ({ ...s, rang: i + 1 })),
    })),
    [tours],
  )

  const positions = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = []
    for (const t of decoded) {
      pts.push(...t.line)
      for (const s of t.stopsOrdonnes) pts.push([s.lat, s.lng])
    }
    if (depot) pts.push([depot.lat, depot.lng])
    return pts
  }, [decoded, depot])

  const center: [number, number] = positions[0] ?? [48.58, 7.75]

  return (
    <div className="rounded-[var(--r-lg)] overflow-hidden border border-[var(--border)]">
      <div className="h-[420px] w-full">
        <MapContainer center={center} zoom={12} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution="© OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {decoded.map(t => (
            t.line.length > 1 && (
              <Polyline key={t.id} positions={t.line} pathOptions={{ color: t.color, weight: 4, opacity: 0.85 }} />
            )
          ))}
          {decoded.flatMap(t => t.stopsOrdonnes.map(s => (
            <Marker
              key={`${t.id}-${s.rang}`}
              position={[s.lat, s.lng]}
              icon={stopIcon(s.rang, t.color)}
              zIndexOffset={-s.rang}
            />
          )))}
          {depot && <Marker position={[depot.lat, depot.lng]} icon={DEPOT_ICON} />}
          <FitBounds positions={positions} />
        </MapContainer>
      </div>

      {/* Légende : pastille couleur + véhicule + km/durée */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-3 py-2.5 border-t border-[var(--border)] bg-[var(--bg-elevated)]">
        {tours.map(t => (
          <div key={t.id} className="flex items-center gap-1.5 text-[var(--fs-xs)]">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: t.color }} />
            <span className="text-[var(--text)] font-medium">{t.vehicleLabel}</span>
            <span className="text-[var(--text-muted)] font-mono">
              {t.totalKm != null ? `${Number(t.totalKm).toFixed(1)} km` : '—'}
              {' · '}
              {t.totalMin != null ? formatDuration(t.totalMin) : '—'}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-[var(--fs-xs)]">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: DEPOT_COLOR }} />
          <span className="text-[var(--text-muted)]">Dépôt</span>
        </div>
      </div>
    </div>
  )
}

export default memo(ToursOverviewMap)
