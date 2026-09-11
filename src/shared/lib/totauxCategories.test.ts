import { describe, it, expect } from 'vitest'
import {
  totauxParCategorie, lignesTotauxCategories,
  type ChargePourTotaux, type AllocationPourTotaux,
} from './totauxCategories'

const charge = (id: string, ttc: number | null, cat: string | null = null): ChargePourTotaux =>
  ({ id, montant_ttc_cts: ttc, category_id: cat })
const alloc = (charge_id: string, amount: number, cat: string | null = null): AllocationPourTotaux =>
  ({ charge_id, amount_cts: amount, category_id: cat })

describe('totauxParCategorie', () => {
  it('cas vide', () => {
    expect(totauxParCategorie([], []).size).toBe(0)
  })

  it('sans ventilation, toute la charge va dans sa catégorie', () => {
    const t = totauxParCategorie([charge('c1', 12000, 'carburant')], [])
    expect(t.get('carburant')).toBe(12000)
    expect(t.size).toBe(1)
  })

  it('cumule plusieurs charges de la même catégorie', () => {
    const t = totauxParCategorie(
      [charge('c1', 12000, 'carburant'), charge('c2', 8000, 'carburant')], [],
    )
    expect(t.get('carburant')).toBe(20000)
  })

  it('ventilation : une facture se répartit entre plusieurs catégories', () => {
    // Le cas visé : une facture de station = lave-glace + AdBlue.
    const t = totauxParCategorie(
      [charge('facture', 10000, 'entretien')],
      [alloc('facture', 3000, 'lave-glace'), alloc('facture', 7000, 'adblue')],
    )
    expect(t.get('lave-glace')).toBe(3000)
    expect(t.get('adblue')).toBe(7000)
    expect(t.get('entretien')).toBeUndefined() // entièrement ventilée
  })

  it('ventilation partielle : le reliquat retombe sur la catégorie de la charge', () => {
    const t = totauxParCategorie(
      [charge('facture', 10000, 'entretien')],
      [alloc('facture', 3000, 'adblue')],
    )
    expect(t.get('adblue')).toBe(3000)
    expect(t.get('entretien')).toBe(7000)
  })

  it('une ligne de ventilation sans catégorie hérite de celle de la charge', () => {
    const t = totauxParCategorie(
      [charge('facture', 10000, 'entretien')],
      [alloc('facture', 4000, null)],
    )
    expect(t.get('entretien')).toBe(10000) // 4000 hérités + 6000 de reliquat
  })

  it('sur-ventilation : on ne retranche jamais, pas de total négatif', () => {
    const t = totauxParCategorie(
      [charge('facture', 10000, 'entretien')],
      [alloc('facture', 15000, 'adblue')],
    )
    expect(t.get('adblue')).toBe(15000)
    expect(t.get('entretien')).toBeUndefined()
    expect([...t.values()].every(v => v > 0)).toBe(true)
  })

  it('charge sans catégorie : conservée sous la clé null, jamais masquée', () => {
    const t = totauxParCategorie([charge('c1', 5000, null)], [])
    expect(t.get(null)).toBe(5000)
  })

  it('ignore les montants absents ou aberrants', () => {
    const t = totauxParCategorie(
      [charge('c1', null, 'a'), charge('c2', 0, 'a'), charge('c3', -500, 'a'), charge('c4', 1000, 'a')],
      [alloc('c4', -200, 'b'), alloc('c4', Number.NaN, 'b')],
    )
    expect(t.get('a')).toBe(1000)
    expect(t.get('b')).toBeUndefined()
  })

  it('ignore une allocation orpheline (charge absente de la liste)', () => {
    const t = totauxParCategorie([charge('c1', 1000, 'a')], [alloc('fantome', 9999, 'b')])
    expect(t.get('a')).toBe(1000)
    expect(t.get('b')).toBeUndefined()
  })
})

describe('lignesTotauxCategories', () => {
  const noms = new Map([['adblue', 'AdBlue'], ['lave-glace', 'Lave-glace']])

  it('résout les noms, calcule les parts et trie par montant décroissant', () => {
    const totaux = new Map<string | null, number>([['lave-glace', 3000], ['adblue', 7000]])
    const l = lignesTotauxCategories(totaux, noms)
    expect(l.map(x => x.nom)).toEqual(['AdBlue', 'Lave-glace'])
    expect(l[0].part).toBeCloseTo(0.7)
    expect(l[1].part).toBeCloseTo(0.3)
  })

  it('« Sans catégorie » passe en dernier même si c’est le plus gros montant', () => {
    const totaux = new Map<string | null, number>([[null, 90000], ['adblue', 1000]])
    expect(lignesTotauxCategories(totaux, noms).map(x => x.nom))
      .toEqual(['AdBlue', 'Sans catégorie'])
  })

  it('nomme explicitement une catégorie supprimée plutôt que d’afficher un identifiant', () => {
    const totaux = new Map<string | null, number>([['disparue', 500]])
    expect(lignesTotauxCategories(totaux, noms)[0].nom).toBe('Catégorie supprimée')
  })

  it('total général nul → parts à 0, pas de division par zéro', () => {
    expect(lignesTotauxCategories(new Map(), noms)).toEqual([])
  })
})
