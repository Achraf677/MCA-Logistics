// Logique pure de ventilation — validation des montants d'allocation.
// Aucune dépendance DB / DOM. Le "reste à couvrir" vient de
// allocations.ts (targetCouvertureCts) ; ici on valide la SAISIE d'une
// nouvelle allocation contre ce reste.

import { targetCouvertureCts, type AllocationPick } from './allocations'

/** Reste à couvrir d'une cible — alias explicite pour l'UI de ventilation. */
export function resteCibleCts(
  targetAmountCts: number | null | undefined,
  allocations: AllocationPick[] | null | undefined,
): number {
  return targetCouvertureCts(targetAmountCts, allocations)
}

export interface ValidationMontant {
  ok: boolean
  /** Montant validé en centimes (présent uniquement si ok). */
  cts?: number
  /** Message d'erreur lisible (présent uniquement si !ok). */
  error?: string
}

/**
 * Valide une saisie libre de montant (euros, virgule ou point) contre le reste.
 * Règles :
 *  - saisie vide / non numérique → erreur
 *  - montant ≤ 0 → erreur
 *  - montant > reste → erreur "dépassement" (somme > montant cible interdite)
 */
export function validerMontantAllocation(saisie: string, resteCts: number): ValidationMontant {
  const s = (saisie ?? '').trim().replace(',', '.')
  if (!s) return { ok: false, error: 'Montant requis' }
  const n = parseFloat(s)
  if (!Number.isFinite(n)) return { ok: false, error: 'Montant invalide' }
  const cts = Math.round(n * 100)
  if (cts <= 0) return { ok: false, error: 'Le montant doit être positif' }
  if (cts > resteCts) {
    return { ok: false, error: `Dépasse le reste à couvrir (${(resteCts / 100).toFixed(2).replace('.', ',')} €)` }
  }
  return { ok: true, cts }
}

/** Statut d'une cible pour l'UI : à ventiler / partiellement / entièrement. */
export type EtatVentilation = 'aucune' | 'partielle' | 'complete'

export function etatVentilation(
  targetAmountCts: number | null | undefined,
  allocations: AllocationPick[] | null | undefined,
): EtatVentilation {
  const total = Number(targetAmountCts) || 0
  if (total <= 0) return 'aucune'
  const reste = resteCibleCts(total, allocations)
  if (reste >= total) return 'aucune'
  return reste === 0 ? 'complete' : 'partielle'
}
