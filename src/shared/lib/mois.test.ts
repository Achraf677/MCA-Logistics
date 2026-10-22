import { describe, it, expect } from 'vitest'
import { grouperParMois, libelleMois, moisOuvertParDefaut } from './mois'

describe('grouperParMois', () => {
  const rows = [
    { id: 'a', d: '2026-09-30' }, { id: 'b', d: '2026-10-02' }, { id: 'c', d: '2026-10-21T08:00:00Z' },
    { id: 'd', d: null }, { id: 'e', d: '2025-12-01' },
  ]
  it('récent d’abord, « sans date » en dernier, ordre interne gardé', () => {
    const g = grouperParMois(rows, r => r.d)
    expect(g.map(x => x.cle)).toEqual(['2026-10', '2026-09', '2025-12', 'sans-date'])
    expect(g[0].rows.map(r => r.id)).toEqual(['b', 'c'])
    expect(g[3].libelle).toBe('Sans date')
  })
  it('liste vide', () => { expect(grouperParMois([], () => null)).toEqual([]) })
})

describe('libellés et mois ouvert', () => {
  it('libellé en français avec majuscule', () => {
    expect(libelleMois('2026-10')).toBe('Octobre 2026')
    expect(libelleMois('nimporte')).toBe('nimporte')
  })
  it('mois courant sinon le plus récent', () => {
    expect(moisOuvertParDefaut(['2026-10', '2026-09'], new Date(2026, 9, 22))).toBe('2026-10')
    expect(moisOuvertParDefaut(['2026-09', 'sans-date'], new Date(2026, 9, 22))).toBe('2026-09')
    expect(moisOuvertParDefaut([], new Date())).toBeNull()
  })
})
