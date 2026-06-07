import { useEffect, useMemo } from 'react'
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

function stopIcon(n: number | null, color: string): L.DivIcon {
  return pin(
    `<div style="width:24px;height:24px;border-radius:50%;background:${color};
      color:#fff;font:700 11px/24px system-ui;text-align:center;
      border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${n ?? '•'}</div>`,
  )
}

function depotIcon(): L.DivIcon {
  return pin(
    `<div style="width:26px;height:26px;border-radius:50%;background:${DEPOT_COLOR};
      color:#fff;font:700 12px/26px system-ui;text-align:center;
      border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">D</div>`,
  )
}

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

export default function ToursOverviewMap({ tours, depot }: Props) {
  // Décodage des polylines (précision 5 par défaut, ORS/Google).
  const decoded = useMemo(
    () => tours.map(t => ({
      ...t,
      line: t.geometry ? (polyline.decode(t.geometry) as [number, number][]) : [],
    })),
    [tours],
  )

  const positions = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = []
    for (const t of decoded) {
      pts.push(...t.line)
      for (const s of t.stops) pts.push([s.lat, s.lng])
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
          {decoded.flatMap(t => t.stops.map(s => (
            <Marker
              key={`${t.id}-${s.lat},${s.lng},${s.stop_order ?? ''}`}
              position={[s.lat, s.lng]}
              icon={stopIcon(s.stop_order, t.color)}
            />
          )))}
          {depot && <Marker position={[depot.lat, depot.lng]} icon={depotIcon()} />}
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
