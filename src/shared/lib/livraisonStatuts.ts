// Machine à états des livraisons — PURE (sans DB ni DOM), source de vérité UNIQUE.
//
// Vit dans shared/ parce que plusieurs features en dépendent : Livraisons,
// Tournées, et l'écran chauffeur « Mes courses ». La dupliquer, ne serait-ce
// que pour les deux transitions qu'un chauffeur peut déclencher, créerait deux
// règles qui divergeraient au premier changement.
//
// `features/livraisons/livraisons.logic.ts` la ré-exporte pour ne casser aucun
// import existant.

export type DeliveryStatus =
  | 'planifiee'
  | 'en_cours'
  | 'livree'
  | 'facturee'
  | 'payee'
  | 'annulee'

export const TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  // 'livree' directe depuis 'planifiee' : un chauffeur peut livrer un arrêt
  // sans passer explicitement par 'en_cours' (suivi de tournée mobile).
  planifiee: ['en_cours', 'livree', 'annulee'],
  en_cours:  ['livree', 'annulee'],
  livree:    ['facturee'],
  facturee:  ['payee'],
  payee:     [],
  annulee:   [],
}

export function canTransition(from: string, to: string): boolean {
  const allowed = TRANSITIONS[from as DeliveryStatus]
  return Array.isArray(allowed) && allowed.includes(to as DeliveryStatus)
}

export function allowedNextStatuses(from: string): DeliveryStatus[] {
  return TRANSITIONS[from as DeliveryStatus] ?? []
}
