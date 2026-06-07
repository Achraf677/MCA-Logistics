import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import polyline from '@mapbox/polyline'
import 'leaflet/dist/leaflet.css'

export interface MapStop {
  stop_order: number | null
  lat: number
  lng: number
  label: string
}

interface Props {
  geometry: string | null
  depot: { lat: number; lng: number } | null
  stops: MapStop[]
}

const BRAND = '#e63946'
const DEPOT = '#06d6a0'

// ── Icônes custom (L.divIcon) — les icônes PNG par défaut de Leaflet sont
//    cassées avec Vite (résolution d'URL), on n'en dépend donc pas. ───────────

function pin(html: string): L.DivIcon {
  return L.divIcon({ className: 'mca-tour-pin', html, iconSize: [26, 26], iconAnchor: [13, 13] })
}

function depotIcon(): L.DivIcon {
  return pin(
    `<div style="width:26px;height:26px;border-radius:50%;background:${DEPOT};
      color:#fff;font:700 12px/26px system-ui;text-align:center;
      border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">D</div>`,
  )
}

function stopIcon(n: number | null): L.DivIcon {
  return pin(
    `<div style="width:26px;height:26px;border-radius:50%;background:${BRAND};
      color:#fff;font:700 12px/26px system-ui;text-align:center;
      border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${n ?? '•'}</div>`,
  )
}

// ── Recadrage automatique sur l'ensemble tracé + marqueurs ────────────────────

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length === 0) return
    if (positions.length === 1) { map.setView(positions[0], 14); return }
    map.fitBounds(L.latLngBounds(positions), { padding: [40, 40] })
  }, [map, positions])
  return null
}

export default function TourMap({ geometry, depot, stops }: Props) {
  // Polyline encodée ORS/Google, précision 5 par défaut.
  const line = useMemo<[number, number][]>(
    () => (geometry ? (polyline.decode(geometry) as [number, number][]) : []),
    [geometry],
  )

  const positions = useMemo<[number, number][]>(() => [
    ...line,
    ...(depot ? [[depot.lat, depot.lng] as [number, number]] : []),
    ...stops.map(s => [s.lat, s.lng] as [number, number]),
  ], [line, depot, stops])

  const center: [number, number] = positions[0] ?? [48.58, 7.75]

  return (
    <div className="h-[400px] w-full rounded-[var(--r-lg)] overflow-hidden border border-[var(--border)]">
      <MapContainer center={center} zoom={12} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution="© OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {line.length > 1 && (
          <Polyline positions={line} pathOptions={{ color: BRAND, weight: 4, opacity: 0.85 }} />
        )}
        {depot && <Marker position={[depot.lat, depot.lng]} icon={depotIcon()} />}
        {stops.map(s => (
          <Marker key={`${s.lat},${s.lng},${s.stop_order ?? ''}`} position={[s.lat, s.lng]} icon={stopIcon(s.stop_order)} />
        ))}
        <FitBounds positions={positions} />
      </MapContainer>
    </div>
  )
}
