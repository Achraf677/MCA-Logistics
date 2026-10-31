import { describe, it, expect } from 'vitest'
import { appliquerHistorique, indexerHistorique, type LigneHistorique } from './historiqueAdresses.ts'

const h = (p: Partial<LigneHistorique>): LigneHistorique => ({
  commune: 'Brumath', rue: 'Rue des Tuiles', numero: '27', collecte: 0, normal: 0, eclate: 0, eclate_collecte: 1, ...p,
})
const a = (p: Record<string, unknown> = {}) => ({
  commune: 'BRUMATH', rue: 'rue des tuiles', numero: '27', quantite: 1, type: 'c' as const, note: null as string | null, ...p,
})

describe('appliquerHistorique', () => {
  it('sans historique : rien ne change', () => {
    const l = [a()]
    expect(appliquerHistorique(l, indexerHistorique([]))).toBe(l)
  })

  it('adresse passée en collecte, 1 colis → collecte', () => {
    const r = appliquerHistorique([a()], indexerHistorique([h({ collecte: 2 })]))
    expect(r).toHaveLength(1)
    expect(r[0].type).toBe('col')
    expect(r[0].note).toMatch(/historique/)
  })

  it('collecte revenue en normal plus souvent : inchangé', () => {
    const r = appliquerHistorique([a()], indexerHistorique([h({ collecte: 1, normal: 2 })]))
    expect(r[0].type).toBe('c')
  })

  it('adresse éclatée, 3 colis → 1 collecte + 2 normaux, total conservé', () => {
    const r = appliquerHistorique([a({ quantite: 3 })], indexerHistorique([h({ eclate: 1 })]))
    expect(r.map(x => [x.type, x.quantite])).toEqual([['c', 2], ['col', 1]])
    expect(r.reduce((s, x) => s + x.quantite, 0)).toBe(3)
  })

  it('collecte habituelle de 2 colis sur 4', () => {
    const r = appliquerHistorique([a({ quantite: 4 })], indexerHistorique([h({ eclate: 1, eclate_collecte: 2 })]))
    expect(r.map(x => x.quantite)).toEqual([2, 2])
  })

  it('jamais plus de colis en collecte que n - 1', () => {
    const r = appliquerHistorique([a({ quantite: 2 })], indexerHistorique([h({ eclate: 1, eclate_collecte: 5 })]))
    expect(r.map(x => [x.type, x.quantite])).toEqual([['c', 1], ['col', 1]])
  })

  it('plusieurs colis et simple historique de collecte : inchangé + note', () => {
    const r = appliquerHistorique([a({ quantite: 2 })], indexerHistorique([h({ collecte: 3 })]))
    expect(r).toHaveLength(1)
    expect(r[0].type).toBe('c')
    expect(r[0].quantite).toBe(2)
    expect(r[0].note).toMatch(/possible/)
  })

  it('relais et collectes lues : jamais touchés', () => {
    const l = [a({ type: 'rc' as const }), a({ type: 'col' as const })]
    expect(appliquerHistorique(l, indexerHistorique([h({ collecte: 5 })])).map(x => x.type)).toEqual(['rc', 'col'])
  })

  it('accents, casse et espaces du numéro ignorés ; une autre adresse reste intacte', () => {
    const idx = indexerHistorique([h({ commune: 'Brumáth', rue: 'RUE DES TUILES', numero: '27 ', collecte: 1 })])
    expect(appliquerHistorique([a()], idx)[0].type).toBe('col')
    expect(appliquerHistorique([a({ numero: '29' })], idx)[0].type).toBe('c')
  })

  it('écritures voisines de la même adresse additionnées', () => {
    const idx = indexerHistorique([h({ collecte: 1 }), h({ rue: 'rue des tuiles', collecte: 1, normal: 1 })])
    expect(idx.size).toBe(1)
    expect([...idx.values()][0].collecte).toBe(2)
  })

  it('note existante conservée', () => {
    const r = appliquerHistorique([a({ note: 'CRBT : 12' })], indexerHistorique([h({ collecte: 1 })]))
    expect(r[0].note).toBe('CRBT : 12 · Collecte habituelle (historique)')
  })
})
