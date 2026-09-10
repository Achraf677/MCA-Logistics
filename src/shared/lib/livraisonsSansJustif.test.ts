import { describe, it, expect } from 'vitest'
import {
  countLivraisonsSansJustif, filterLivraisonsSansJustif, isLivraisonSansJustif,
  type DeliveryForJustif, type DocumentForJustif,
} from './livraisonsSansJustif'

const livree = (over: Partial<DeliveryForJustif> = {}): DeliveryForJustif => ({
  id: 'd1', statut: 'livree', pod_captured_at: null, lv_pdf_url: null, ...over,
})

describe('justif_non_requis', () => {
  it('écarte une livraison explicitement marquée « justificatif non requis »', () => {
    expect(isLivraisonSansJustif(livree({ justif_non_requis: true }), [])).toBe(false)
  })

  it('ne change rien quand le champ est absent (données antérieures) ou false', () => {
    expect(isLivraisonSansJustif(livree(), [])).toBe(true)
    expect(isLivraisonSansJustif(livree({ justif_non_requis: false }), [])).toBe(true)
    expect(isLivraisonSansJustif(livree({ justif_non_requis: null }), [])).toBe(true)
  })

  it('n’est pas comptée dans le total', () => {
    const deliveries = [livree({ id: 'd1' }), livree({ id: 'd2', justif_non_requis: true })]
    expect(countLivraisonsSansJustif(deliveries, [])).toBe(1)
    expect(filterLivraisonsSansJustif(deliveries, []).map(d => d.id)).toEqual(['d1'])
  })
})

describe('countLivraisonsSansJustif', () => {
  it('retourne 0 quand aucune livraison', () => {
    expect(countLivraisonsSansJustif([], [])).toBe(0)
  })

  it('retourne 0 quand toutes les livraisons ont un justificatif', () => {
    const deliveries: DeliveryForJustif[] = [
      livree({ id: 'd1', pod_captured_at: '2026-07-20T10:00:00Z' }),
      livree({ id: 'd2', lv_pdf_url: 'https://drive/lv-2.pdf' }),
    ]
    const documents: DocumentForJustif[] = [
      { entity_type: 'delivery', entity_id: 'd2' },
    ]
    expect(countLivraisonsSansJustif(deliveries, documents)).toBe(0)
  })

  it('cas mixte : compte uniquement les livraisons sans aucun justificatif', () => {
    const deliveries: DeliveryForJustif[] = [
      livree({ id: 'd1', pod_captured_at: '2026-07-20T10:00:00Z' }), // POD -> OK
      livree({ id: 'd2' }), // document lié -> OK
      livree({ id: 'd3' }), // rien -> sans justif
      livree({ id: 'd4', statut: 'planifiee' }), // statut non concerné -> ignoré
      livree({ id: 'd5', statut: 'annulee' }), // statut non concerné -> ignoré
    ]
    const documents: DocumentForJustif[] = [
      { entity_type: 'delivery', entity_id: 'd2' },
      { entity_type: 'client', entity_id: 'd3' }, // mauvais entity_type -> ne compte pas
    ]
    expect(countLivraisonsSansJustif(deliveries, documents)).toBe(1)
    expect(filterLivraisonsSansJustif(deliveries, documents).map(d => d.id)).toEqual(['d3'])
  })

  it('livraison livrée avec POD = OK (pas de justificatif manquant)', () => {
    const delivery = livree({ id: 'd1', pod_captured_at: '2026-07-22T08:30:00Z' })
    expect(isLivraisonSansJustif(delivery, [])).toBe(false)
  })

  it('facturee/payee sans aucun justificatif sont aussi comptées', () => {
    const deliveries: DeliveryForJustif[] = [
      livree({ id: 'd1', statut: 'facturee' }),
      livree({ id: 'd2', statut: 'payee' }),
    ]
    expect(countLivraisonsSansJustif(deliveries, [])).toBe(2)
  })
})
