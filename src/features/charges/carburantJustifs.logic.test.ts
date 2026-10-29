import { describe, it, expect } from 'vitest'
import { pleinsDuMois, totauxParVehicule, moisDecale, totalPleins, ticketsCarburant, csvCarburant } from './carburantJustifs.logic'

const t = (o: Partial<Parameters<typeof pleinsDuMois>[0][number]>) =>
  ({ statut: 'a_traiter', moyen_paiement: 'carte_carburant', montant_ttc_cts: 5000, date_depense: '2026-10-05', vehicle_id: 'v1', created_at: '2026-10-05T08:00:00Z', ...o })

describe('carburant justificatifs', () => {
  const liste = [
    t({ date_depense: '2026-10-05' }),
    t({ date_depense: '2026-10-20', vehicle_id: 'v2', montant_ttc_cts: 7000 }),
    t({ date_depense: '2026-10-21', vehicle_id: null, montant_ttc_cts: 1000 }),
    t({ date_depense: '2026-09-30' }),
    t({ statut: 'ignore' }),
    t({ moyen_paiement: 'carte_societe' }),
  ]
  it('ne garde que la carte carburant non refusée', () => {
    expect(ticketsCarburant(liste)).toHaveLength(4)
  })
  it('pleins du mois, récents d\'abord', () => {
    const p = pleinsDuMois(liste, '2026-10')
    expect(p.map(x => x.date_depense)).toEqual(['2026-10-21', '2026-10-20', '2026-10-05'])
    expect(totalPleins(p)).toBe(13000)
  })
  it('totaux par véhicule, non précisé en dernier', () => {
    const r = totauxParVehicule(pleinsDuMois(liste, '2026-10'), id => `Camion ${id}`)
    expect(r.map(x => [x.libelle, x.nb, x.totalCts])).toEqual([['Camion v2', 1, 7000], ['Camion v1', 1, 5000], ['Véhicule non précisé', 1, 1000]])
    expect(r[0].partPct).toBe(54)
  })
  it('mois précédent / suivant', () => {
    expect(moisDecale('2026-01', -1)).toBe('2025-12')
    expect(moisDecale('2026-12', 1)).toBe('2027-01')
  })
  it('csv', () => {
    const csv = csvCarburant(pleinsDuMois(liste, '2026-10'), id => `V-${id}`, () => 'EDENRED : *9156', () => 'Lucas')
    expect(csv.split('\n')[1]).toBe('2026-10-05;V-v1;EDENRED : *9156;Lucas;50,00')
  })
})

describe('pleins saisis à la main', () => {
  it('comptent dans le mois et par véhicule comme un ticket', async () => {
    const { pleinManuelEnLigne } = await import('./carburantJustifs.logic')
    const m = pleinManuelEnLigne({ id: 'm1', vehicle_id: 'v1', date_plein: '2026-10-10', montant_ttc_cts: 6000, carte: null, note: null, created_at: '2026-10-10T07:00:00Z' })
    const p = pleinsDuMois([t({}), m], '2026-10')
    expect(p).toHaveLength(2)
    expect(totalPleins(p)).toBe(11000)
    expect(totauxParVehicule(p, id => id)[0]).toMatchObject({ cle: 'v1', nb: 2, totalCts: 11000 })
  })
})

describe('litres × prix', () => {
  it('montant TTC en centimes sans dérive', async () => {
    const { montantPleinCts, decimalSaisi, totalLitres } = await import('./carburantJustifs.logic')
    expect(montantPleinCts(45.2, 1.789)).toBe(8086)
    expect(montantPleinCts(50, 1.5)).toBe(7500)
    expect(montantPleinCts(33.33, 1.999)).toBe(6663)
    expect(decimalSaisi('45,2', 2)).toBe(45.2)
    expect(decimalSaisi('1,789', 3)).toBe(1.789)
    expect(decimalSaisi('', 2)).toBeNull()
    expect(Number.isNaN(decimalSaisi('1,7891', 3))).toBe(true)
    expect(Number.isNaN(decimalSaisi('abc', 2))).toBe(true)
    expect(totalLitres([{ litres: 40 }, { litres: null }, {}])).toBe(40)
  })
})
