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

/** Km relevés d'un véhicule (plein ou entretien) : sert à connaître le dernier km sans ressaisie. */
export interface KmReleve { vehicle_id: string; mileage_km: number | null }

/** Dernier km connu par véhicule : le plus grand entre la fiche et les relevés (un compteur ne recule pas). */
export function kmConnus(vehicles: Vehicle[], releves: KmReleve[]): Map<string, number> {
  const km = new Map<string, number>(vehicles.map(v => [v.id, v.mileage_km ?? 0]))
  for (const r of releves) {
    if (r.mileage_km == null || !km.has(r.vehicle_id)) continue
    if (r.mileage_km > (km.get(r.vehicle_id) ?? 0)) km.set(r.vehicle_id, r.mileage_km)
  }
  return km
}

/** Véhicule en service dont le CT ou l'assurance n'est pas renseigné (la révision reste facultative). */
export function estIncomplet(v: Vehicle): boolean {
  return v.status !== 'inactive' && (!v.ct_expiry || !v.insurance_expiry)
}

/** Libellés des échéances obligatoires manquantes (CT, assurance). */
export function echeancesManquantes(v: Vehicle): string[] {
  const manque: string[] = []
  if (!v.ct_expiry) manque.push('Contrôle technique')
  if (!v.insurance_expiry) manque.push('Assurance')
  return manque
}

/** Résumé d'une carte : l'échéance la plus pressante, sinon ce qui manque, sinon « à jour ». */
export function resumeEcheance(v: Vehicle, today = new Date()): { texte: string; status: EcheanceStatus | 'manque' } {
  const pire = vehicleEcheances(v, today)[0]
  if (pire && pire.daysLeft != null && (pire.status === 'overdue' || pire.status === 'soon')) {
    const jours = pire.status === 'overdue' ? `dépassé de ${Math.abs(pire.daysLeft)} j` : pire.daysLeft === 0 ? "aujourd'hui" : `dans ${pire.daysLeft} j`
    return { texte: `${pire.label} ${jours}`, status: pire.status }
  }
  const manque = echeancesManquantes(v)
  if (manque.length > 0 && v.status !== 'inactive') return { texte: `${manque.join(' et ')} à renseigner`, status: 'manque' }
  return pire && pire.status === 'ok' ? { texte: 'Échéances à jour', status: 'ok' } : { texte: '', status: 'none' }
}

export interface CriteresVehicules {
  recherche?: string
  status?: Vehicle['status'] | 'all'
  fuel_type?: NonNullable<Vehicle['fuel_type']> | 'all'
  echeance?: 'urgent' | 'all'
  incomplet?: boolean
}

const sansAccent = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Filtre de la liste, côté client (quelques véhicules : un seul chargement). */
export function filtrerVehicules(vehicles: Vehicle[], c: CriteresVehicules, today = new Date()): Vehicle[] {
  const mot = sansAccent((c.recherche ?? '').trim())
  return vehicles.filter(v => {
    if (c.status && c.status !== 'all' && v.status !== c.status) return false
    if (c.fuel_type && c.fuel_type !== 'all' && v.fuel_type !== c.fuel_type) return false
    if (c.echeance === 'urgent') {
      const w = worstStatus(vehicleEcheances(v, today))
      if (w !== 'overdue' && w !== 'soon') return false
    }
    if (c.incomplet && !estIncomplet(v)) return false
    if (mot && !sansAccent([v.label, v.plate, v.brand, v.model].filter(Boolean).join(' ')).includes(mot)) return false
    return true
  })
}

/** Compteurs des tuiles, sur l'ensemble des véhicules (pas sur la liste filtrée). */
export function compteursVehicules(vehicles: Vehicle[], today = new Date()) {
  const enService = vehicles.filter(v => v.status !== 'inactive')
  const pires = enService.map(v => worstStatus(vehicleEcheances(v, today)))
  return {
    total: vehicles.length,
    actifs: vehicles.filter(v => v.status === 'active').length,
    maintenance: vehicles.filter(v => v.status === 'maintenance').length,
    echeancesProches: pires.filter(w => w === 'soon' || w === 'overdue').length,
    echeancesDepassees: pires.filter(w => w === 'overdue').length,
    aRenseigner: vehicles.filter(estIncomplet).length,
  }
}

/** Le nom du véhicule dit déjà marque et modèle ? Alors on ne les répète pas sur la carte. */
export function descriptionVehicule(v: Vehicle): string {
  const nom = sansAccent(v.label)
  const parts = [v.brand, v.model].filter((x): x is string => !!x && !nom.includes(sansAccent(x)))
  return [...parts, v.year].filter(Boolean).join(' ')
}

const cellule = (x: string | number | null | undefined) => {
  const t = x == null ? '' : String(x)
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

/** Export CSV de la liste affichée (séparateur « ; », une ligne par véhicule, textes protégés). */
export function exportVehiculesCSV(vehicles: Vehicle[], today = new Date(), km: Map<string, number> = new Map()): string {
  const headers = ['Véhicule', 'Immat.', 'Marque', 'Modèle', 'Année', 'Carburant', 'Crit\'Air', 'PTAC (kg)',
    'Km (fiche)', 'Dernier km connu', 'Statut', 'Contrôle technique', 'Assurance', 'Révision', 'Échéances', 'Notes']
  const lines = vehicles.map(v => [
    v.label, v.plate, v.brand, v.model, v.year,
    v.fuel_type ? FUEL_LABELS[v.fuel_type] ?? v.fuel_type : '', v.critair, v.ptac_kg,
    v.mileage_km, km.get(v.id) ?? v.mileage_km, STATUS_LABELS[v.status],
    v.ct_expiry, v.insurance_expiry, v.next_revision_date,
    { ok: 'OK', soon: 'Proche', overdue: 'Dépassée', none: '' }[worstStatus(vehicleEcheances(v, today))],
    v.notes,
  ].map(cellule).join(';'))
  return [headers.map(cellule).join(';'), ...lines].join('\n')
}
