import { describe, it, expect } from 'vitest'
import {
  kmCourse, tauxAuKm, chargements, totauxChargements,
  KM_MINIMUM_FIABLE, type CoursePourCout, type TauxAuKm,
} from './chargements.logic'

function course(p: Partial<CoursePourCout>): CoursePourCout {
  return {
    date: '2026-09-08', vehicle_id: 'v1', tour_id: null,
    amount_ht_cts: 10000, km: 100, empty_km: 0,
    ...p,
  }
}

const nom = (id: string | null) => (id === 'v1' ? 'MOVANO' : id === 'v2' ? 'JUMPER' : 'Sans véhicule')

describe('kmCourse', () => {
  it('additionne les km en charge et à vide', () => {
    // Les km à vide brûlent le même carburant : les exclure embellirait
    // justement les courses où l'on rentre vide.
    expect(kmCourse({ km: 300, empty_km: 120 })).toBe(420)
  })
  it('traite les valeurs absentes comme zéro', () => {
    expect(kmCourse({ km: null, empty_km: null })).toBe(0)
    expect(kmCourse({ km: 50, empty_km: null })).toBe(50)
  })
})

describe('tauxAuKm', () => {
  it('mesure le coût au km sur les dépenses réelles', () => {
    // 200 € de carburant pour 1000 km → 20 cts/km.
    const t = tauxAuKm(
      [course({ km: 600 }), course({ km: 400 })],
      [{ total_cts: 20000 }],
      [{ cost_cts: 5000 }],
    )
    expect(t.carburantCtsParKm).toBeCloseTo(20)
    expect(t.entretienCtsParKm).toBeCloseTo(5)
    expect(t.kmMesures).toBe(1000)
  })

  it('sans kilomètre, renvoie zéro et jamais une division par zéro', () => {
    const t = tauxAuKm([course({ km: 0, empty_km: 0 })], [{ total_cts: 50000 }], [])
    expect(t.carburantCtsParKm).toBe(0)
    expect(t.kmMesures).toBe(0)
    expect(t.fiable).toBe(false)
    expect(Number.isFinite(t.carburantCtsParKm)).toBe(true)
  })

  it('marque le taux comme peu fiable sous le seuil de kilomètres', () => {
    const t = tauxAuKm([course({ km: 40 })], [{ total_cts: 8000 }, { total_cts: 8000 }], [])
    expect(t.kmMesures).toBeLessThan(KM_MINIMUM_FIABLE)
    expect(t.fiable).toBe(false)
  })

  it('marque le taux comme peu fiable avec un seul plein', () => {
    const t = tauxAuKm([course({ km: 5000 })], [{ total_cts: 80000 }], [])
    expect(t.fiable).toBe(false)
  })

  it('devient fiable avec assez de kilomètres et de pleins', () => {
    const t = tauxAuKm([course({ km: 5000 })], [{ total_cts: 40000 }, { total_cts: 40000 }], [])
    expect(t.fiable).toBe(true)
  })

  it('ignore les montants absents', () => {
    const t = tauxAuKm([course({ km: 1000 })], [{ total_cts: null }, { total_cts: 10000 }], [{ cost_cts: null }])
    expect(t.carburantCtsParKm).toBeCloseTo(10)
    expect(t.entretienCtsParKm).toBe(0)
  })
})

describe('chargements', () => {
  const taux: TauxAuKm = {
    carburantCtsParKm: 18.5, entretienCtsParKm: 2, kmMesures: 10000, fiable: true,
  }

  it('regroupe les courses par jour ET par véhicule', () => {
    const l = chargements([
      course({ date: '2026-09-08', vehicle_id: 'v1' }),
      course({ date: '2026-09-08', vehicle_id: 'v1' }),
      course({ date: '2026-09-08', vehicle_id: 'v2' }),
      course({ date: '2026-09-07', vehicle_id: 'v1' }),
    ], taux, nom)
    expect(l).toHaveLength(3)
    expect(l.find(x => x.date === '2026-09-08' && x.vehicule === 'MOVANO')!.nbCourses).toBe(2)
  })

  it('applique les coûts AU KILOMÈTRE', () => {
    // 1000 km × 18,5 cts = 18 500 cts de carburant ; × 2 cts = 2 000 d'entretien.
    const l = chargements([course({ km: 1000, amount_ht_cts: 90000 })], taux, nom)
    expect(l[0].carburantCts).toBe(18500)
    expect(l[0].entretienCts).toBe(2000)
    expect(l[0].margeCts).toBe(90000 - 18500 - 2000)
  })

  it('calcule la marge au kilomètre, null sans kilomètre saisi', () => {
    const avec = chargements([course({ km: 1000, amount_ht_cts: 40500 })], taux, nom)[0]
    expect(avec.margeParKmCts).toBeCloseTo(20)

    const sans = chargements([course({ km: 0, empty_km: 0, amount_ht_cts: 35000 })], taux, nom)[0]
    expect(sans.margeParKmCts).toBeNull()
    // Sans kilomètre, aucun coût n'est imputé : la marge est la recette brute,
    // visiblement incomplète plutôt que faussement précise.
    expect(sans.margeCts).toBe(35000)
  })

  it('signale une journée adossée à une tournée dès qu’une course en a une', () => {
    const l = chargements([
      course({ tour_id: null }),
      course({ tour_id: 't1' }),
    ], taux, nom)
    expect(l[0].enTournee).toBe(true)
  })

  it('affiche une marge négative telle quelle', () => {
    // Une journée qui coûte plus qu'elle ne rapporte doit se voir, pas être
    // ramenée à zéro.
    const l = chargements([course({ km: 1000, amount_ht_cts: 5000 })], taux, nom)
    expect(l[0].margeCts).toBeLessThan(0)
  })

  it('nomme « Sans véhicule » une course non affectée, sans l’écarter', () => {
    const l = chargements([course({ vehicle_id: null })], taux, nom)
    expect(l[0].vehicule).toBe('Sans véhicule')
  })

  it('ignore les courses sans date : elles ne peuvent appartenir à aucun jour', () => {
    expect(chargements([course({ date: null })], taux, nom)).toEqual([])
  })

  it('trie du plus récent au plus ancien', () => {
    const l = chargements([
      course({ date: '2026-07-01' }),
      course({ date: '2026-09-08' }),
      course({ date: '2026-08-15' }),
    ], taux, nom)
    expect(l.map(x => x.date)).toEqual(['2026-09-08', '2026-08-15', '2026-07-01'])
  })

  it('liste vide → aucun chargement', () => {
    expect(chargements([], taux, nom)).toEqual([])
  })
})

describe('totauxChargements', () => {
  it('somme la période champ par champ', () => {
    const taux: TauxAuKm = { carburantCtsParKm: 10, entretienCtsParKm: 0, kmMesures: 1000, fiable: true }
    const lignes = chargements([
      course({ date: '2026-09-08', km: 100, amount_ht_cts: 20000 }),
      course({ date: '2026-09-07', km: 200, amount_ht_cts: 30000 }),
    ], taux, nom)
    const t = totauxChargements(lignes)
    expect(t.nbChargements).toBe(2)
    expect(t.nbCourses).toBe(2)
    expect(t.km).toBe(300)
    expect(t.recettesHtCts).toBe(50000)
    expect(t.carburantCts).toBe(3000)
    expect(t.margeCts).toBe(47000)
  })

  it('période vide → tout à zéro', () => {
    expect(totauxChargements([]).nbChargements).toBe(0)
  })
})
