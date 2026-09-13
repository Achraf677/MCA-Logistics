import { describe, it, expect } from 'vitest'
import {
  arretsDuJour, deplacerArretJour, positionsAEcrire,
  type CoursePourArrets,
} from './arretsJour'

function c(p: Partial<CoursePourArrets> & { id: string }): CoursePourArrets {
  return {
    pickup_address: 'Retrait', delivery_address: 'Livraison',
    pickup_order: null, stop_order: null,
    charge_le: null, statut: 'planifiee',
    ...p,
  }
}

describe('arretsDuJour', () => {
  it('découpe une course en deux arrêts', () => {
    const a = arretsDuJour([c({ id: 'A' })])
    expect(a.map(x => x.type)).toEqual(['retrait', 'livraison'])
    expect(a.map(x => x.cle)).toEqual(['A:retrait', 'A:livraison'])
  })

  it('ne crée pas d’arrêt de retrait sans adresse de retrait', () => {
    // Une course qui part du dépôt, marchandise déjà chargée.
    const a = arretsDuJour([c({ id: 'A', pickup_address: null })])
    expect(a).toHaveLength(1)
    expect(a[0].type).toBe('livraison')
  })

  it('crée l’arrêt de livraison même sans adresse, pour que le manque se voie', () => {
    const a = arretsDuJour([c({ id: 'A', pickup_address: null, delivery_address: null })])
    expect(a).toHaveLength(1)
    expect(a[0].adresse).toBe('')
  })

  it('EXPRIME la journée entrelacée : charger A, charger B, livrer A, livrer B', () => {
    // C'est précisément ce qu'un ordre par course ne pouvait pas dire.
    const a = arretsDuJour([
      c({ id: 'A', pickup_order: 1, stop_order: 3 }),
      c({ id: 'B', pickup_order: 2, stop_order: 4 }),
    ])
    expect(a.map(x => x.cle)).toEqual([
      'A:retrait', 'B:retrait', 'A:livraison', 'B:livraison',
    ])
  })

  it('place les arrêts jamais ordonnés APRÈS ceux qui le sont', () => {
    const a = arretsDuJour([
      c({ id: 'NEUF' }),
      c({ id: 'RANGE', pickup_order: 1, stop_order: 2 }),
    ])
    expect(a.slice(0, 2).map(x => x.courseId)).toEqual(['RANGE', 'RANGE'])
  })

  it('à position égale, le retrait d’une course passe avant sa livraison', () => {
    const a = arretsDuJour([c({ id: 'A', pickup_order: 5, stop_order: 5 })])
    expect(a.map(x => x.type)).toEqual(['retrait', 'livraison'])
  })

  it('marque le retrait fait dès que la course est chargée', () => {
    const a = arretsDuJour([c({ id: 'A', charge_le: '2026-09-14T08:00:00Z' })])
    expect(a.find(x => x.type === 'retrait')!.fait).toBe(true)
    expect(a.find(x => x.type === 'livraison')!.fait).toBe(false)
  })

  it('marque les deux arrêts faits sur une course close', () => {
    for (const statut of ['livree', 'facturee', 'payee', 'annulee']) {
      const a = arretsDuJour([c({ id: 'A', statut })])
      expect(a.every(x => x.fait)).toBe(true)
    }
  })

  it('journée vide → aucun arrêt', () => {
    expect(arretsDuJour([])).toEqual([])
  })
})

describe('deplacerArretJour', () => {
  const base = arretsDuJour([
    c({ id: 'A', pickup_order: 1, stop_order: 2 }),
    c({ id: 'B', pickup_order: 3, stop_order: 4 }),
  ])

  it('remonte un arrêt d’un cran', () => {
    const apres = deplacerArretJour(base, 'B:retrait', 'haut')
    expect(apres.map(x => x.cle)).toEqual(['A:retrait', 'B:retrait', 'A:livraison', 'B:livraison'])
  })

  it('descend un arrêt d’un cran', () => {
    const apres = deplacerArretJour(base, 'A:retrait', 'bas')
    expect(apres[0].cle).toBe('A:livraison')
  })

  it('renvoie le tableau inchangé aux extrémités et sur une clé inconnue', () => {
    expect(deplacerArretJour(base, 'A:retrait', 'haut')).toBe(base)
    expect(deplacerArretJour(base, 'B:livraison', 'bas')).toBe(base)
    expect(deplacerArretJour(base, 'ZZZ:retrait', 'haut')).toBe(base)
  })

  it('ne modifie pas le tableau d’origine', () => {
    const avant = base.map(x => x.cle)
    deplacerArretJour(base, 'B:retrait', 'haut')
    expect(base.map(x => x.cle)).toEqual(avant)
  })
})

describe('positionsAEcrire', () => {
  it('numérote la séquence à partir de 1, retraits et livraisons mêlés', () => {
    const arrets = arretsDuJour([
      c({ id: 'A', pickup_order: 1, stop_order: 3 }),
      c({ id: 'B', pickup_order: 2, stop_order: 4 }),
    ])
    expect(positionsAEcrire(arrets)).toEqual([
      { courseId: 'A', pickup_order: 1, stop_order: 3 },
      { courseId: 'B', pickup_order: 2, stop_order: 4 },
    ])
  })

  it('n’écrit que la position qui existe pour une course sans retrait', () => {
    const arrets = arretsDuJour([c({ id: 'A', pickup_address: null })])
    expect(positionsAEcrire(arrets)).toEqual([{ courseId: 'A', stop_order: 1 }])
  })

  it('reflète un déplacement dans les positions', () => {
    const arrets = arretsDuJour([
      c({ id: 'A', pickup_order: 1, stop_order: 2 }),
      c({ id: 'B', pickup_order: 3, stop_order: 4 }),
    ])
    // A:retrait, A:livraison, B:retrait, B:livraison → on descend A:livraison.
    const apres = deplacerArretJour(arrets, 'A:livraison', 'bas')
    expect(positionsAEcrire(apres)).toEqual([
      { courseId: 'A', pickup_order: 1, stop_order: 3 },
      { courseId: 'B', pickup_order: 2, stop_order: 4 },
    ])
  })

  it('séquence vide → rien à écrire', () => {
    expect(positionsAEcrire([])).toEqual([])
  })
})
