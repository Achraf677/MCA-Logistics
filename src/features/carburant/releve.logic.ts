// Import d'un RELEVÉ de carte carburant (Fleet Pro, Carte Total, AS24, DKV…) :
// une facture, plusieurs pleins. Fonctions PURES — la lecture du document est
// faite par l'Edge Function `lire-releve`, qui ne connaît AUCUN modèle de
// fournisseur : l'IA ramène n'importe quel relevé au même format.
import type { FuelType } from './carburant.types'

/** Ligne telle que renvoyée par `lire-releve` (données non fiables). */
export interface LigneReleveBrute {
  date?: unknown
  station?: unknown
  produit?: unknown
  litres?: unknown
  prix_litre?: unknown
  montant_ttc?: unknown
  plaque?: unknown
  carte?: unknown
  kilometrage?: unknown
}

/** Ligne éditable dans le tableau d'import. */
export interface LigneReleve {
  cle: string
  inclure: boolean
  date: string
  station: string
  /** `null` = frais / ligne hors carburant et liquides (non importée par défaut). */
  produit: FuelType | null
  litres: string
  prixLitre: string
  montantTtc: string
  plaque: string
  kilometrage: string
  vehicleId: string
  driverId: string
}

const PRODUITS: Array<{ motif: RegExp; type: FuelType }> = [
  { motif: /ad[\s-]?blue/i, type: 'adblue' },
  { motif: /lave[\s-]?glace/i, type: 'lave_glace' },
  { motif: /huile/i, type: 'huile_moteur' },
  { motif: /refroidissement|antigel/i, type: 'liquide_refroidissement' },
  { motif: /frein/i, type: 'liquide_frein' },
  { motif: /gazole|gasoil|diesel|gnr|\bb7\b|\bb10\b|\bxtl\b|hvo/i, type: 'diesel' },
  { motif: /sp\s?9[58]|e10|e85|essence|sans\s?plomb/i, type: 'essence' },
  { motif: /gpl|lpg/i, type: 'lpg' },
  { motif: /[ée]lectri|recharge|kwh/i, type: 'electric' },
]

/** Produit lu (texte libre) → produit de l'app ; `null` pour frais/abonnement/inconnu. */
export function produitDepuisTexte(texte: unknown): FuelType | null {
  const t = typeof texte === 'string' ? texte : ''
  if (!t.trim()) return null
  return PRODUITS.find(p => p.motif.test(t))?.type ?? null
}

function nombre(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function dateIso(v: unknown, repli: string): string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : repli
}

/** Normalise les lignes lues. Ce qui n'est ni carburant ni liquide est décoché. */
export function normaliserLignes(brutes: LigneReleveBrute[], dateRepli: string): LigneReleve[] {
  return (Array.isArray(brutes) ? brutes : []).map((b, i) => {
    const produit = produitDepuisTexte(b.produit)
    const litres = nombre(b.litres)
    const prix = nombre(b.prix_litre)
    const montant = nombre(b.montant_ttc)
    const km = nombre(b.kilometrage)
    return {
      cle: `l${i}`,
      inclure: produit != null && montant != null,
      date: dateIso(b.date, dateRepli),
      station: typeof b.station === 'string' ? b.station.trim() : '',
      produit,
      litres: litres != null ? litres.toFixed(2) : '',
      prixLitre: prix != null ? prix.toFixed(3) : '',
      montantTtc: montant != null ? montant.toFixed(2) : '',
      plaque: typeof b.plaque === 'string' ? b.plaque.trim() : '',
      kilometrage: km != null ? String(Math.round(km)) : '',
      vehicleId: '',
      driverId: '',
    }
  })
}

export function euroVersCts(v: string): number {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/**
 * Contrôle de somme : TOUTES les lignes lues (même décochées, ex. frais de
 * carte) doivent égaler le total de la facture — c'est la preuve que la
 * lecture n'a rien oublié. Seules les lignes cochées seront créées.
 */
export function controleReleve(lignes: LigneReleve[], totalFactureCts: number | null) {
  const sommeLueCts = lignes.reduce((s, l) => s + euroVersCts(l.montantTtc), 0)
  const importeCts = lignes.filter(l => l.inclure).reduce((s, l) => s + euroVersCts(l.montantTtc), 0)
  const ecartCts = totalFactureCts != null ? totalFactureCts - sommeLueCts : null
  return { sommeLueCts, importeCts, horsImportCts: sommeLueCts - importeCts, ecartCts }
}

/** Pourquoi une ligne cochée ne peut pas être créée (null = OK). */
export function erreurLigne(l: LigneReleve, estLiquide: (t: FuelType | null) => boolean): string | null {
  if (!l.inclure) return null
  if (!l.produit) return 'produit manquant'
  if (!l.vehicleId) return 'véhicule manquant'
  if (!l.driverId) return 'chauffeur manquant'
  if (euroVersCts(l.montantTtc) <= 0) return 'montant manquant'
  if (!estLiquide(l.produit) && !(Number(l.litres.replace(',', '.')) > 0)) return 'litres manquants'
  return null
}
