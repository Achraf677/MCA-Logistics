// Détection des livraisons sans justificatif — PUR (sans DB ni DOM), testable.
//
// "Sans justificatif" = livraison statut ∈ {livree, facturee, payee} SANS POD
// (pod_captured_at) ET SANS document lié (documents.entity_type='delivery')
// ET SANS lettre de voiture archivée (lv_pdf_url).

export interface DeliveryForJustif {
  id: string
  statut: string
  pod_captured_at: string | null
  lv_pdf_url: string | null
}

export interface DocumentForJustif {
  entity_type: string | null
  entity_id: string | null
}

const STATUTS_CONCERNES = new Set(['livree', 'facturee', 'payee'])

/** Une livraison a un justificatif si POD capturé, document lié, ou LV archivée. */
export function isLivraisonSansJustif(
  delivery: DeliveryForJustif,
  documents: DocumentForJustif[],
): boolean {
  if (!STATUTS_CONCERNES.has(delivery.statut)) return false
  if (delivery.pod_captured_at) return false
  if (delivery.lv_pdf_url) return false
  const aUnDocument = documents.some(
    d => d.entity_type === 'delivery' && d.entity_id === delivery.id,
  )
  return !aUnDocument
}

/** Sous-ensemble des livraisons concernées, dans l'ordre d'entrée. */
export function filterLivraisonsSansJustif<T extends DeliveryForJustif>(
  deliveries: T[],
  documents: DocumentForJustif[],
): T[] {
  return deliveries.filter(d => isLivraisonSansJustif(d, documents))
}

export function countLivraisonsSansJustif(
  deliveries: DeliveryForJustif[],
  documents: DocumentForJustif[],
): number {
  return filterLivraisonsSansJustif(deliveries, documents).length
}
