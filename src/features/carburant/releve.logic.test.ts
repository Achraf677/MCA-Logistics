import { describe, it, expect } from 'vitest'
import { controleReleve, erreurLigne, normaliserLignes, produitDepuisTexte } from './releve.logic'
import { estLiquide } from './carburant.logic'

describe('Import de relevé de carte carburant', () => {
  it('reconnaît les produits quel que soit le fournisseur', () => {
    expect(produitDepuisTexte('GAZOLE')).toBe('diesel')
    expect(produitDepuisTexte('Excellium Diesel')).toBe('diesel')
    expect(produitDepuisTexte('SP95-E10')).toBe('essence')
    expect(produitDepuisTexte('ADBLUE VRAC')).toBe('adblue')
    expect(produitDepuisTexte('Frais de gestion carte')).toBeNull()
    expect(produitDepuisTexte(null)).toBeNull()
  })

  it('normalise et décoche ce qui n’est ni carburant ni liquide', () => {
    const l = normaliserLignes([
      { date: '2026-09-03', station: 'TOTAL STRASBOURG', produit: 'Gazole', litres: '42,5', prix_litre: 1.799, montant_ttc: 76.46, plaque: 'FG-788-FB', kilometrage: 123456.4 },
      { date: 'n/a', produit: 'Cotisation carte', montant_ttc: 2.7 },
    ], '2026-09-15')
    expect(l[0]).toMatchObject({ inclure: true, produit: 'diesel', litres: '42.50', prixLitre: '1.799', montantTtc: '76.46', kilometrage: '123456', date: '2026-09-03' })
    expect(l[1]).toMatchObject({ inclure: false, produit: null, date: '2026-09-15', montantTtc: '2.70' })
  })

  it('contrôle la somme lue contre le total de la facture', () => {
    const l = normaliserLignes([
      { produit: 'Gazole', montant_ttc: 100 },
      { produit: 'Frais', montant_ttc: 2.7 },
    ], '2026-09-15')
    expect(controleReleve(l, 10270)).toEqual({ sommeLueCts: 10270, importeCts: 10000, horsImportCts: 270, ecartCts: 0 })
    expect(controleReleve(l, 10300).ecartCts).toBe(30)
  })

  it('exige véhicule, chauffeur, montant, et litres pour un carburant', () => {
    const [l] = normaliserLignes([{ produit: 'Gazole', montant_ttc: 50 }], '2026-09-15')
    expect(erreurLigne(l, estLiquide)).toBe('véhicule manquant')
    const complet = { ...l, vehicleId: 'v', driverId: 'd' }
    expect(erreurLigne(complet, estLiquide)).toBe('litres manquants')
    expect(erreurLigne({ ...complet, litres: '25' }, estLiquide)).toBeNull()
    expect(erreurLigne({ ...complet, produit: 'adblue' }, estLiquide)).toBeNull()
  })
})
