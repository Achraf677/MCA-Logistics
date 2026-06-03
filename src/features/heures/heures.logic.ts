import type { WorkHourRow } from './heures.types'

export function formatMinutes(minutes: number | null): string {
  if (minutes == null || minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

export function formatTime(t: string | null): string {
  if (!t) return '—'
  return t.slice(0, 5) // "HH:MM" from "HH:MM:SS"
}

export function kpiSummary(rows: WorkHourRow[]) {
  const totalMinutes = rows.reduce((s, r) => s + (r.total_minutes ?? 0), 0)
  const withDelivery = rows.filter(r => r.delivery_id != null).length
  const uniqueDrivers = new Set(rows.map(r => r.member_id)).size
  return { nb: rows.length, totalMinutes, withDelivery, uniqueDrivers }
}
