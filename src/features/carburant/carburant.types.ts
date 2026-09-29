/** Carburants — comptent dans les litres, le prix moyen au litre et la conso. */
export type Carburant = 'diesel' | 'essence' | 'electric' | 'hybrid' | 'lpg'
/** Liquides du véhicule — même écran, mais hors stats carburant. */
export type Liquide =
  | 'adblue' | 'lave_glace' | 'huile_moteur' | 'liquide_refroidissement'
  | 'liquide_frein' | 'autre_liquide'
/** Produit d'une ligne de « Carburant & liquides » (colonne fuel_type). */
export type FuelType = Carburant | Liquide

export interface FuelLog {
  id: string
  company_id: string
  vehicle_id: string
  driver_id: string | null
  date: string
  liters: number
  price_per_liter_milli: number
  total_cts: number
  fuel_type: FuelType | null
  mileage_km: number | null
  station: string | null
  tva_rate: number
  tva_deductible_pct: number
  tva_cts: number | null
  receipt_url: string | null
  supplier_id: string | null
  charge_id: string | null
  created_at: string
  updated_at: string
}

export interface FuelLogRow extends FuelLog {
  vehicles: { label: string; plate: string } | null
  team_members: { full_name: string } | null
  charges: { id: string; label: string; montant_ttc_cts: number | null; receipt_url: string | null; pennylane_id: string | null } | null
}

// charge_id et tva_cts sont optionnels
export type FuelLogInsert = Omit<FuelLog, 'id' | 'created_at' | 'updated_at' | 'tva_cts' | 'charge_id'> & { tva_cts?: number | null; charge_id?: string | null }
export type FuelLogUpdate = Partial<Omit<FuelLog, 'id' | 'company_id' | 'created_at'>>

export interface FuelFilters {
  vehicle_id?: string | 'all'
  /** Filtre côté client : tous les produits, carburants seuls ou liquides seuls. */
  famille?: 'all' | 'carburant' | 'liquide'
  date_from?: string
  date_to?: string
}

export type { ChargePick } from '../../shared/types/charges'
