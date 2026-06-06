import type { ExtractedDelivery } from './copilote.types'

/** Normalise un nom pour le matching client : minuscules, trim, sans accents. */
export function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
}

/**
 * Une ligne est "vide" (résidu d'une feuille) si client_name ET les deux adresses
 * ET le montant sont tous absents. Ces lignes ne sont pas cochées par défaut.
 */
export function isEmptyRow(d: ExtractedDelivery): boolean {
  return (
    !d.client_name &&
    !d.pickup_address &&
    !d.delivery_address &&
    d.montant_ht_eur == null
  )
}

/** Statut calculé d'après la date : strictement future → planifiee, sinon livree. */
export function computeStatut(date: string | null): 'planifiee' | 'livree' {
  if (!date) return 'livree'
  const today = new Date().toISOString().slice(0, 10)
  return date > today ? 'planifiee' : 'livree'
}

export function statutLabel(statut: 'planifiee' | 'livree'): string {
  return statut === 'planifiee' ? 'Planifiée' : 'Livrée'
}

/** Euros (nombre|null) → centimes entiers. null → 0. */
export function eurosToCts(eur: number | null): number {
  return Math.round((eur ?? 0) * 100)
}

/** Matching chauffeur par nom normalisé. Renvoie l'id ou null (jamais de création). */
export function matchDriver(
  name: string | null,
  drivers: Array<{ id: string; full_name: string }>,
): string | null {
  if (!name) return null
  const n = normalizeName(name)
  const found = drivers.find(d => normalizeName(d.full_name) === n)
  return found ? found.id : null
}

/**
 * Matching véhicule : par label normalisé OU par plaque (normalisée sans espaces ni tirets).
 * Renvoie l'id ou null (jamais de création).
 */
export function matchVehicle(
  v: string | null,
  vehicles: Array<{ id: string; label: string; plate: string | null }>,
): string | null {
  if (!v) return null
  const target = normalizeName(v)
  const plateNorm = (s: string) => normalizeName(s).replace(/[\s-]/g, '')
  const targetPlate = plateNorm(v)
  const found = vehicles.find(
    veh =>
      normalizeName(veh.label) === target ||
      (veh.plate != null && plateNorm(veh.plate) === targetPlate),
  )
  return found ? found.id : null
}
