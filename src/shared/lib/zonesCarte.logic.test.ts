import { describe, it, expect } from 'vitest'
import { dessinerZones, pointsZones, type PointZone } from './zonesCarte.logic'

// Grille fictive : 10 × 10 numéros espacés d'environ 40 m ; zone 1 à gauche (x < 5), zone 2 à droite.
const grille = (): PointZone[] => {
  const out: PointZone[] = []
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
    out.push({ lat: 48.7 + i * 0.00036, lng: 7.7 + j * 0.00054, zone: j < 5 ? 'ZONE 1' : 'ZONE 2' })
  }
  return out
}

describe('pointsZones', () => {
  it('rue à une zone : ses numéros prennent cette zone', () => {
    const pts = pointsZones([{ rue_cle: 'rue a', numeros: { '1': [48.7, 7.7], '2': [48.7001, 7.7] } }], [{ rue_cle: 'rue a', zones: ['ZONE 3'] }])
    expect(pts.map(p => p.zone)).toEqual(['ZONE 3', 'ZONE 3'])
  })
  it('rue coupée : chaque numéro prend la zone permise la plus proche', () => {
    const pts = pointsZones([
      { rue_cle: 'rue a', numeros: { '1': [48.7, 7.7] } },
      { rue_cle: 'rue b', numeros: { '1': [48.71, 7.7] } },
      { rue_cle: 'coupee', numeros: { '1': [48.7001, 7.7], '99': [48.7099, 7.7] } },
    ], [{ rue_cle: 'rue a', zones: ['ZONE 2'] }, { rue_cle: 'rue b', zones: ['ZONE 3'] }, { rue_cle: 'coupee', zones: ['ZONE 2', 'ZONE 3'] }])
    expect(pts.slice(2).map(p => p.zone)).toEqual(['ZONE 2', 'ZONE 3'])
  })
  it('rue absente du fichier : zone du numéro voisin ; position invalide ignorée', () => {
    const pts = pointsZones([
      { rue_cle: 'rue a', numeros: { '1': [48.7, 7.7] } },
      { rue_cle: 'inconnue', numeros: { '1': [48.7002, 7.7001], '2': [NaN, 7] as [number, number] } },
    ], [{ rue_cle: 'rue a', zones: ['ZONE 5'] }])
    expect(pts).toHaveLength(2)
    expect(pts[1].zone).toBe('ZONE 5')
  })
})

describe('dessinerZones', () => {
  it('une zone par couleur, chaque numéro a sa cellule', () => {
    const d = dessinerZones(grille())
    expect(d.zones.map(z => [z.zone, z.nb])).toEqual([['ZONE 1', 50], ['ZONE 2', 50]])
    for (const z of d.zones) for (const c of z.cellules) expect(c.length).toBeGreaterThanOrEqual(3)
  })
  it('la frontière passe entre les colonnes 4 et 5, nulle part ailleurs', () => {
    const d = dessinerZones(grille())
    const limite = 7.7 + 4.5 * 0.00054
    expect(d.frontieres.length).toBeGreaterThan(0)
    for (const seg of d.frontieres) for (const [, lng] of seg) expect(Math.abs(lng - limite)).toBeLessThan(0.00006)
  })
  it('les cellules restent à moins du rayon de leur numéro (pas de zone qui déborde dans les champs)', () => {
    const d = dessinerZones([{ lat: 48.7, lng: 7.7, zone: 'ZONE 1' }, { lat: 48.701, lng: 7.7, zone: 'ZONE 1' }, { lat: 48.7, lng: 7.702, zone: 'ZONE 2' }], 90)
    for (const z of d.zones) for (const c of z.cellules) for (const [lat, lng] of c) {
      const proche = Math.min(...[[48.7, 7.7], [48.701, 7.7], [48.7, 7.702]].map(([a, b]) => Math.hypot((lat - a) * 110574, (lng - b) * 73500)))
      expect(proche).toBeLessThan(92)
    }
  })
  it('un numéro isolé (adresse mal placée) ne dessine rien', () => {
    const d = dessinerZones([...grille(), { lat: 48.72, lng: 7.72, zone: 'ZONE 1' }])
    expect(d.zones.find(z => z.zone === 'ZONE 1')!.nb).toBe(50)
  })
  it('étiquette au milieu de la zone ; moins de 3 points : rien', () => {
    const d = dessinerZones(grille())
    expect(d.zones[0].etiquette[1]).toBeLessThan(d.zones[1].etiquette[1])
    expect(dessinerZones([{ lat: 48.7, lng: 7.7, zone: 'ZONE 1' }])).toEqual({ zones: [], frontieres: [] })
  })
})
