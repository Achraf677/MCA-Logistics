import { toLocalISO } from '../../shared/lib/dates'
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

function enMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** Fin avant le début = journée qui passe minuit (ex. 22:00 → 02:00 = 4 h). */
export function passeMinuit(start: string | null, end: string | null): boolean {
  if (!start || !end) return false
  const d = enMinutes(start), f = enMinutes(end)
  return d != null && f != null && f < d
}

/**
 * Durée nette en minutes (fin − début − pause), journée de nuit comprise
 * (+24 h si la fin est avant le début). null si une heure manque ou si la
 * pause mange toute la durée.
 */
export function dureeNetteMinutes(start: string | null, end: string | null, pauseMin: number): number | null {
  if (!start || !end) return null
  const d = enMinutes(start), f = enMinutes(end)
  if (d == null || f == null || d === f) return null
  const brut = f > d ? f - d : f + 24 * 60 - d
  const net = brut - Math.max(0, pauseMin || 0)
  return net > 0 ? net : null
}

/**
 * Durée d'une ligne. La colonne `total_minutes` (calculée par la base) est
 * fausse pour une journée qui passe minuit (négative) : on la recalcule ici.
 */
export function dureeLigne(r: Pick<WorkHourRow, 'start_time' | 'end_time' | 'break_minutes' | 'total_minutes'>): number | null {
  return dureeNetteMinutes(r.start_time, r.end_time, r.break_minutes ?? 0) ?? (r.total_minutes != null && r.total_minutes > 0 ? r.total_minutes : null)
}

export function kpiSummary(rows: WorkHourRow[]) {
  const totalMinutes = rows.reduce((s, r) => s + (dureeLigne(r) ?? 0), 0)
  const withDelivery = rows.filter(r => r.delivery_id != null).length
  const uniqueDrivers = new Set(rows.map(r => r.member_id)).size
  return { nb: rows.length, totalMinutes, withDelivery, uniqueDrivers }
}

/** Mois en cours (dates locales) : période affichée par défaut. */
export function moisEnCours(today = new Date()): { date_from: string; date_to: string } {
  return {
    date_from: toLocalISO(new Date(today.getFullYear(), today.getMonth(), 1)),
    date_to:   toLocalISO(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  }
}
