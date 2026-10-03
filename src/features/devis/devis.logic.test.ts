import { describe, it, expect } from 'vitest'
import {
  addDays, isExpiredDisplay, uniteParDefaut, prixParDefaut, montantsDevis, resumeLigne,
  ligneDepuisAncien, versLivraison, tarifDepuisDevis, seTransformeEnCourse,
  versLivraisonFacturable, peutFacturerDirectement,
} from './devis.logic'
import type { Quote } from './devis.types'

const devis = (p: Partial<Quote> = {}): Quote => ({
  id: 'q1', company_id: 'c1', client_id: 'cl1', date: '2026-10-02', valid_until: '2026-11-01',
  description: 'Messagerie Strasbourg', amount_ht_cts: 300000, tva_rate: 20, tva_cts: 60000,
  amount_ttc_cts: 360000, pickup_address: 'A', delivery_address: 'B', vehicle_id: 'v1', driver_id: 'd1',
  statut: 'accepte', pennylane_quote_id: null, pennylane_quote_number: null, pennylane_invoice_id: null,
  notes: null, prestation: 'messagerie', unite: 'colis', quantite: 3000, prix_unitaire_cts: 100,
  extra_lines: [], reference_client: 'ODT-1', autoliquidation: false, accepte_le: null, sync_error: null,
  expediteur_nom: 'Quai 3', expediteur_tel: '0600', destinataire_nom: 'M. Martin', destinataire_tel: '0700',
  marchandise_desc: 'Palette', nb_colis: null, poids_kg: 120, volume_m3: 1.2, km: null,
  created_at: '', updated_at: '', ...p,
})

describe('dates locales', () => {
  it('addDays franchit le mois sans UTC', () => {
    expect(addDays('2026-10-02', 30)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('expiré seulement si envoyé et validité passée', () => {
    expect(isExpiredDisplay('2026-10-01', 'envoye', '2026-10-02')).toBe(true)
    expect(isExpiredDisplay('2026-10-02', 'envoye', '2026-10-02')).toBe(false)
    expect(isExpiredDisplay('2026-10-01', 'brouillon', '2026-10-02')).toBe(false)
  })
})

describe('défauts depuis le client', () => {
  it('messagerie → au colis, sinon unité du tarif', () => {
    expect(uniteParDefaut('messagerie', 'km')).toBe('colis')
    expect(uniteParDefaut('express', 'km')).toBe('km')
    expect(uniteParDefaut('express', 'manuel')).toBe('forfait')
    expect(uniteParDefaut(null, null)).toBe('forfait')
  })
  it('prix du tarif client seulement dans la même unité', () => {
    const c = { tariff_mode: 'colis', tariff_rate_cts: 100 }
    expect(prixParDefaut('colis', c)).toBe(100)
    expect(prixParDefaut('km', c)).toBeNull()
    expect(prixParDefaut('forfait', c)).toBeNull()
    expect(prixParDefaut('colis', null)).toBeNull()
  })
})

describe('montantsDevis', () => {
  it('3 000 colis × 1 € = 3 000 € HT, 3 600 € TTC', () => {
    expect(montantsDevis({ quantite: 3000, prix_unitaire_cts: 100, extra_lines: [], tva_rate: 20, autoliquidation: false }))
      .toEqual({ principalHtCts: 300000, supplementsHtCts: 0, htCts: 300000, tvaCts: 60000, ttcCts: 360000, blocage: null })
  })
  it('suppléments ajoutés au HT, TVA sur le total', () => {
    const m = montantsDevis({
      quantite: 1, prix_unitaire_cts: 8000, tva_rate: 20, autoliquidation: false,
      extra_lines: [{ label: 'Attente', quantity: 2, amount_ht_cts: 1000, tva_rate: 5.5 }],
    })
    expect(m.htCts).toBe(10000)
    expect(m.tvaCts).toBe(2000)
  })
  it('autoliquidation : aucune TVA', () => {
    expect(montantsDevis({ quantite: 10, prix_unitaire_cts: 150, extra_lines: [], tva_rate: 20, autoliquidation: true }).tvaCts).toBe(0)
  })
  it('TVA ligne par ligne, comme Pennylane (pas sur le total)', () => {
    // 3 lignes à 0,05 € : 1 ct de TVA chacune (arrondi par ligne) = 3 ct, et non 3 ct sur 0,15 €.
    const m = montantsDevis({
      quantite: 1, prix_unitaire_cts: 5, tva_rate: 20, autoliquidation: false,
      extra_lines: [{ label: 'A', quantity: 1, amount_ht_cts: 5, tva_rate: 20 }, { label: 'B', quantity: 1, amount_ht_cts: 5, tva_rate: 20 }],
    })
    expect(m.htCts).toBe(15)
    expect(m.tvaCts).toBe(3)
  })
  it('supplément refusé par Pennylane → blocage', () => {
    expect(montantsDevis({
      quantite: 1, prix_unitaire_cts: 5000, tva_rate: 20, autoliquidation: false,
      extra_lines: [{ label: 'Attente', quantity: 1, amount_ht_cts: 0, tva_rate: 20 }],
    }).blocage).toMatch(/Attente/)
  })
  it('quantité absente ou nulle → 1', () => {
    expect(montantsDevis({ quantite: null, prix_unitaire_cts: 5000, extra_lines: [], tva_rate: 20, autoliquidation: false }).htCts).toBe(5000)
  })
})

describe('affichage et anciens devis', () => {
  it('résumé lisible', () => {
    expect(resumeLigne('colis', 3000, 100)).toMatch(/^3\s000 colis × 1,00\s€$/)
    expect(resumeLigne('forfait', 1, 12000)).toMatch(/^Forfait 120,00\s€$/)
  })
  it('ancien devis (montant global) relu en 1 × HT hors suppléments', () => {
    expect(ligneDepuisAncien({ unite: null, quantite: null, prix_unitaire_cts: null, amount_ht_cts: 12000, extra_lines: [] }))
      .toEqual({ unite: 'forfait', quantite: 1, prix_unitaire_cts: 12000 })
  })
})

describe('effets du devis accepté', () => {
  it('course : tout repris, ligne principale = montant, suppléments au même taux', () => {
    const q = devis({
      prestation: 'express', unite: 'km', quantite: 72, prix_unitaire_cts: 150,
      extra_lines: [{ label: 'Attente', quantity: 1, amount_ht_cts: 1500, tva_rate: 5.5 }],
    })
    const l = versLivraison(q, '2026-10-05', 'c1')
    expect(l).toMatchObject({
      date: '2026-10-05', quote_id: 'q1', prestation: 'express', reference_client: 'ODT-1',
      km: 72, nb_colis: null, expediteur_nom: 'Quai 3', destinataire_tel: '0700',
      poids_kg_reel: 120, weight_kg: 120, volume_m3: 1.2, amount_ht_cts: 10800, tva_cts: 2160, amount_ttc_cts: 12960, statut: 'planifiee',
    })
    expect(l.extra_lines[0].tva_rate).toBe(20)
  })
  it('au colis : nb_colis repris', () => {
    expect(versLivraison(devis({ prestation: 'express' }), '2026-10-05', 'c1').nb_colis).toBe(3000)
  })
  it('tarif appliqué au client : messagerie au colis', () => {
    expect(tarifDepuisDevis(devis())).toEqual({ tariff_mode: 'colis', tariff_rate_cts: 100, prestation_defaut: 'messagerie' })
    expect(tarifDepuisDevis(devis({ unite: 'forfait' }))).toBeNull()
    expect(tarifDepuisDevis(devis({ prix_unitaire_cts: 0 }))).toBeNull()
  })
  it('messagerie et forfait ne deviennent pas une course', () => {
    expect(seTransformeEnCourse('messagerie')).toBe(false)
    expect(seTransformeEnCourse('forfait')).toBe(false)
    expect(seTransformeEnCourse('express')).toBe(true)
    expect(seTransformeEnCourse(null)).toBe(true)
  })
})

describe('facturer directement (lot U4)', () => {
  it('course créée livrée, sans preuve attendue, tout repris du devis', () => {
    const q = devis({ prestation: 'express', unite: 'forfait', quantite: 1, prix_unitaire_cts: 12000 })
    const c = versLivraisonFacturable(q, '2026-10-03', 'c1', '2026-10-03T10:00:00.000Z')
    expect(c).toMatchObject({
      statut: 'livree', delivered_at: '2026-10-03T10:00:00.000Z', justif_non_requis: true,
      quote_id: 'q1', date: '2026-10-03', amount_ht_cts: 12000, reference_client: 'ODT-1',
    })
  })
  it('seulement un devis accepté, hors messagerie, pas déjà facturé', () => {
    expect(peutFacturerDirectement(devis({ prestation: 'express' }))).toBe(true)
    expect(peutFacturerDirectement(devis({ prestation: 'messagerie' }))).toBe(false)
    expect(peutFacturerDirectement(devis({ prestation: 'express', statut: 'envoye' }))).toBe(false)
    expect(peutFacturerDirectement(devis({ prestation: 'forfait', pennylane_invoice_id: '9' }))).toBe(false)
  })
})
