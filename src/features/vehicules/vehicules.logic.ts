import { computeEcheance } from '../../shared/lib/echeances'
import type { EcheanceStatus } from '../../shared/lib/echeances'
import type { Vehicle } from './vehicules.types'

export interface VehicleEcheance {
  label: string
  date: string | null
  daysLeft: number | null
  status: EcheanceStatus
}

export function vehicleEcheances(vehicle: Vehicle, today = new Date()): VehicleEcheance[] {
  const entries: Array<{ label: string; date: string | null }> = [
    { label: 'Contrôle technique', date: vehicle.ct_expiry },
    { label: 'Assurance',          date: vehicle.insurance_expiry },
    { label: 'Révision',           date: vehicle.next_revision_date },
  ]

  const results = entries.map(({ label, date }) => {
    const { daysLeft, status } = computeEcheance(date, today)
    return { label, date, daysLeft, status }
  })

  const order: Record<EcheanceStatus, number> = { overdue: 0, soon: 1, ok: 2, none: 3 }
  return results.sort((a, b) => order[a.status] - order[b.status])
}

export function worstStatus(echeances: VehicleEcheance[]): EcheanceStatus {
  if (echeances.some(e => e.status === 'overdue')) return 'overdue'
  if (echeances.some(e => e.status === 'soon'))    return 'soon'
  if (echeances.some(e => e.status === 'ok'))      return 'ok'
  return 'none'
}

export const CRITAIR_COLORS: Record<NonNullable<Vehicle['critair']>, string> = {
  '0':  'bg-green-600  text-white',
  '1':  'bg-purple-600 text-white',
  '2':  'bg-yellow-400 text-black',
  '3':  'bg-orange-500 text-white',
  '4':  'bg-red-600    text-white',
  '5':  'bg-red-800    text-white',
  'NC': 'bg-gray-600   text-white',
}

export const STATUS_LABELS: Record<Vehicle['status'], string> = {
  active:      'Actif',
  maintenance: 'En maintenance',
  inactive:    'Inactif',
}

export const STATUS_COLORS: Record<Vehicle['status'], string> = {
  active:      'success',
  maintenance: 'warning',
  inactive:    'muted',
}

export const FUEL_LABELS: Record<NonNullable<Vehicle['fuel_type']>, string> = {
  diesel:   'Diesel',
  essence:  'Essence',
  electric: 'Électrique',
  hybrid:   'Hybride',
  lpg:      'GPL',
}

export function validatePtac(ptac: number): boolean {
  return ptac > 0 && ptac <= 3500
}

export function getCritairClass(critair: Vehicle['critair']): string {
  return critair ? CRITAIR_COLORS[critair] : 'bg-gray-600 text-white'
}

export function formatMileage(km: number): string {
  return new Intl.NumberFormat('fr-FR').format(km) + ' km'
}

export function isMaintenanceSoon(nextDueDate: string | null): boolean {
  if (!nextDueDate) return false
  const diff = (new Date(nextDueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  return diff <= 30
}
