import { describe, it, expect } from 'vitest'
import {
  carteActiveLe, carteSupprimable, cartesPour, libelleCarte, manquesCarte, nouveauCodeCarte, optionsCartes, statutCarte, typeCarteDuMoyen,
  type CarteBancaire,
} from './cartesBancaires'

const c = (o: Partial<CarteBancaire>): CarteBancaire => ({
  id: 'i', code: 'qonto_4103', nom: 'QONTO', fin: '4103', type: 'societe', actif_a_partir_du: null, inactif_a_partir_du: null, ...o,
})

describe('cartes bancaires', () => {
  it('active entre deux dates (début compris, fin exclue)', () => {
    const x = c({ actif_a_partir_du: '2026-03-01', inactif_a_partir_du: '2026-09-01' })
    expect(carteActiveLe(x, '2026-02-28')).toBe(false)
    expect(carteActiveLe(x, '2026-03-01')).toBe(true)
    expect(carteActiveLe(x, '2026-08-31')).toBe(true)
    expect(carteActiveLe(x, '2026-09-01')).toBe(false)
    expect(carteActiveLe(c({}), '2000-01-01')).toBe(true)
  })
  it('statut aujourd\'hui', () => {
    expect(statutCarte(c({ actif_a_partir_du: '2026-11-01' }), '2026-10-29')).toBe('programmee')
    expect(statutCarte(c({ inactif_a_partir_du: '2026-10-29' }), '2026-10-29')).toBe('inactive')
    expect(statutCarte(c({ inactif_a_partir_du: '2026-12-01' }), '2026-10-29')).toBe('active')
  })
  it('cartes proposées : famille + date, carburant d\'abord', () => {
    const l = [c({ code: 'a', nom: 'B', fin: '1' }), c({ code: 'k', nom: 'EDENRED', fin: '9156', type: 'carburant' }), c({ code: 'z', nom: 'A', fin: '2', inactif_a_partir_du: '2026-01-01' })]
    expect(cartesPour(l, 'societe', '2026-10-29').map(x => x.code)).toEqual(['a'])
    expect(cartesPour(l, 'societe', '2025-10-29').map(x => x.code)).toEqual(['z', 'a'])
    expect(cartesPour(l, 'toutes', '2026-10-29').map(x => x.code)).toEqual(['k', 'a'])
  })
  it('la carte déjà choisie reste dans la liste même inactive', () => {
    const l = [c({ code: 'z', inactif_a_partir_du: '2026-01-01' })]
    expect(optionsCartes(l, 'societe', '2026-10-29').map(o => o.valeur)).toEqual([])
    expect(optionsCartes(l, 'societe', '2026-10-29', 'z').map(o => o.valeur)).toEqual(['z'])
  })
  it('libellé et famille du moyen', () => {
    expect(libelleCarte('qonto_4103', [c({})])).toBe('QONTO : *4103')
    expect(libelleCarte('inconnue', [])).toBe('inconnue')
    expect(libelleCarte(null, [])).toBe('')
    expect(typeCarteDuMoyen('carte_carburant')).toBe('carburant')
    expect(typeCarteDuMoyen('personnel')).toBeNull()
  })
  it('contrôle de saisie', () => {
    const ok = { nom: 'Qonto', fin: '4103', actif_a_partir_du: '', inactif_a_partir_du: '' }
    expect(manquesCarte(ok)).toEqual([])
    expect(manquesCarte({ ...ok, nom: ' ', fin: '1' })).toHaveLength(2)
    expect(manquesCarte({ ...ok, actif_a_partir_du: '2026-05-01', inactif_a_partir_du: '2026-04-01' })).toEqual(['La fin doit être après le début'])
  })
  it('code stable et unique', () => {
    expect(nouveauCodeCarte('Qonto', '4103', [])).toBe('qonto_4103')
    expect(nouveauCodeCarte('Qonto', '4103', ['qonto_4103'])).toBe('qonto_4103-2')
    expect(nouveauCodeCarte('Crédit Agricole', 'A1B2', [])).toBe('credit_agricole_a1b2')
  })
  it('suppression : seulement si aucun montant saisi', () => {
    expect(carteSupprimable(undefined)).toBe(true)
    expect(carteSupprimable({ justificatifs: 0, pleins: 0 })).toBe(true)
    expect(carteSupprimable({ justificatifs: 1, pleins: 0 })).toBe(false)
    expect(carteSupprimable({ justificatifs: 0, pleins: 2 })).toBe(false)
  })
})
