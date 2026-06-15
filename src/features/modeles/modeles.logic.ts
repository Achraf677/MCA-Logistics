// Helpers purs pour les modèles de course (sans DB ni DOM).

/** Résumé d'un trajet "pickup → delivery". Renvoie null si aucune adresse. */
export function tripSummary(pickup: string | null, delivery: string | null): string | null {
  const from = pickup?.trim() || null
  const to = delivery?.trim() || null
  if (!from && !to) return null
  return `${from ?? '—'} → ${to ?? '—'}`
}

/** TTC en centimes depuis un HT (cts) et un taux de TVA en POURCENTAGE (ex. 20). */
export function ttcFromHt(ht_cts: number, tva_rate: number): number {
  return ht_cts + Math.round(ht_cts * tva_rate / 100)
}
