import { describe, it, expect } from 'vitest'
import {
  kmConnus, estIncomplet, resumeEcheance, filtrerVehicules, compteursVehicules, descriptionVehicule, exportVehiculesCSV,
} from './vehicules.logic'
import type { Vehicle } from './vehicules.types'

const AUJOURDHUI = new Date(2026, 9, 29)

const v = (o: Partial<Vehicle>): Vehicle => ({
  id: 'v', company_id: 'c', label: 'Camion test', plate: 'AA-111-AA', brand: null, model: null, year: null, ptac_kg: null,
  critair: null, fuel_type: 'diesel', mileage_km: 1000, purchase_price_cts: null, purchase_date: null, status: 'active',
  storage_url: null, notes: null, ct_expiry: '2027-06-01', insurance_expiry: '2027-06-01', next_revision_date: null,
  created_at: '', updated_at: '', ...o,
})

describe('kmConnus', () => {
  it('prend le plus grand km entre la fiche et les relevés', () => {
    const km = kmConnus([v({ id: 'a', mileage_km: 1000 })], [
      { vehicle_id: 'a', mileage_km: 1500 }, { vehicle_id: 'a', mileage_km: 900 }, { vehicle_id: 'a', mileage_km: null },
    ])
    expect(km.get('a')).toBe(1500)
  })
  it('ignore un relevé d\'un véhicule inconnu', () => {
    expect(kmConnus([v({ id: 'a' })], [{ vehicle_id: 'z', mileage_km: 9 }]).has('z')).toBe(false)
  })
})

describe('estIncomplet', () => {
  it('signale un CT ou une assurance manquants', () => {
    expect(estIncomplet(v({ ct_expiry: null }))).toBe(true)
    expect(estIncomplet(v({ insurance_expiry: null }))).toBe(true)
    expect(estIncomplet(v({}))).toBe(false)
  })
  it('ne réclame rien à un véhicule inactif', () => {
    expect(estIncomplet(v({ status: 'inactive', ct_expiry: null }))).toBe(false)
  })
})

describe('resumeEcheance', () => {
  it('dit le retard le plus pressant', () => {
    const r = resumeEcheance(v({ ct_expiry: '2026-10-19' }), AUJOURDHUI)
    expect(r.status).toBe('overdue')
    expect(r.texte).toBe('Contrôle technique dépassé de 10 j')
  })
  it('annonce une échéance proche', () => {
    expect(resumeEcheance(v({ insurance_expiry: '2026-11-10' }), AUJOURDHUI).texte).toBe('Assurance dans 12 j')
  })
  it('dit ce qui manque', () => {
    expect(resumeEcheance(v({ ct_expiry: null, insurance_expiry: null }), AUJOURDHUI))
      .toEqual({ texte: 'Contrôle technique et Assurance à renseigner', status: 'manque' })
  })
  it('« à jour » quand tout est lointain', () => {
    expect(resumeEcheance(v({}), AUJOURDHUI).status).toBe('ok')
  })
})

describe('filtrerVehicules', () => {
  const liste = [
    v({ id: '1', label: 'Renault Master', plate: 'AB-123-CD', brand: 'Renault' }),
    v({ id: '2', label: 'Berlingo', plate: 'EF-456-GH', fuel_type: 'essence', status: 'maintenance', ct_expiry: null }),
  ]
  it('cherche sans tenir compte des accents ni de la casse', () => {
    expect(filtrerVehicules(liste, { recherche: 'RENAULT' }).map(x => x.id)).toEqual(['1'])
    expect(filtrerVehicules([v({ label: 'Citroën Berlingo' })], { recherche: 'citroen' })).toHaveLength(1)
  })
  it('filtre par statut, carburant, « à renseigner »', () => {
    expect(filtrerVehicules(liste, { status: 'maintenance' }).map(x => x.id)).toEqual(['2'])
    expect(filtrerVehicules(liste, { fuel_type: 'essence' }).map(x => x.id)).toEqual(['2'])
    expect(filtrerVehicules(liste, { incomplet: true }).map(x => x.id)).toEqual(['2'])
  })
  it('filtre les échéances proches ou dépassées', () => {
    const l = [v({ id: 'p', ct_expiry: '2026-11-01' }), v({ id: 'q' })]
    expect(filtrerVehicules(l, { echeance: 'urgent' }, AUJOURDHUI).map(x => x.id)).toEqual(['p'])
  })
})

describe('compteursVehicules', () => {
  it('compte sur l\'ensemble', () => {
    const c = compteursVehicules([
      v({ id: '1' }), v({ id: '2', status: 'maintenance', ct_expiry: '2026-10-01' }), v({ id: '3', status: 'inactive', ct_expiry: null }),
    ], AUJOURDHUI)
    expect(c).toMatchObject({ total: 3, actifs: 1, maintenance: 1, echeancesProches: 1, echeancesDepassees: 1, aRenseigner: 0 })
  })
})

describe('descriptionVehicule', () => {
  it('ne répète pas ce que le nom dit déjà', () => {
    expect(descriptionVehicule(v({ label: 'Renault Master', brand: 'Renault', model: 'Master', year: 2021 }))).toBe('2021')
    expect(descriptionVehicule(v({ label: 'Camion 1', brand: 'Renault', model: 'Master', year: 2021 }))).toBe('Renault Master 2021')
  })
})

describe('exportVehiculesCSV', () => {
  it('protège les textes avec « ; » ou guillemets', () => {
    const csv = exportVehiculesCSV([v({ label: 'A;B', notes: 'dit "ok"' })], AUJOURDHUI)
    const ligne = csv.split('\n')[1]
    expect(ligne.startsWith('"A;B";')).toBe(true)
    expect(ligne).toContain('"dit ""ok"""')
  })
  it('met le dernier km connu', () => {
    const csv = exportVehiculesCSV([v({ id: 'a', mileage_km: 1000 })], AUJOURDHUI, new Map([['a', 1800]]))
    expect(csv.split('\n')[1].split(';').slice(8, 10)).toEqual(['1000', '1800'])
  })
})
