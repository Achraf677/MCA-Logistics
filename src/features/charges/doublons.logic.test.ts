import { describe, it, expect } from 'vitest'
import { trouverDoublonsPennylane, ecartJours, type ChargeConnue } from './doublons.logic'

const pennylane = (o: Partial<ChargeConnue> = {}): ChargeConnue => ({
  id: 'p1',
  date: '2026-03-10',
  montant_ttc_cts: 12000,
  supplier_id: 'f1',
  label: 'Facture Total',
  pennylane_id: 'PL-1',
  ...o,
})

const candidat = {
  date: '2026-03-10',
  montant_ttc_cts: 12000,
  supplier_id: 'f1',
  label: 'Plein gasoil',
}

describe('ecartJours', () => {
  it('compte les jours dans les deux sens', () => {
    expect(ecartJours('2026-03-10', '2026-03-10')).toBe(0)
    expect(ecartJours('2026-03-12', '2026-03-10')).toBe(2)
    expect(ecartJours('2026-03-08', '2026-03-10')).toBe(2)
  })
  it('traverse un changement d heure sans deriver', () => {
    // Passage a l'heure d'ete en France dans la nuit du 28 au 29 mars 2026.
    expect(ecartJours('2026-03-30', '2026-03-28')).toBe(2)
  })
  it('une date illisible ne declenche jamais d alerte', () => {
    expect(ecartJours('pas-une-date', '2026-03-10')).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('garde-fou anti-doublon', () => {
  it('meme fournisseur, meme montant, meme date -> certain', () => {
    const d = trouverDoublonsPennylane(candidat, [pennylane()])
    expect(d).toHaveLength(1)
    expect(d[0].niveau).toBe('certain')
    expect(d[0].raison).toBe('Même fournisseur, même montant, même date.')
  })

  it('fournisseur different -> probable, pas certain', () => {
    const d = trouverDoublonsPennylane(candidat, [pennylane({ supplier_id: 'f2' })])
    expect(d[0].niveau).toBe('probable')
    expect(d[0].raison).toBe('Même montant, même date.')
  })

  it('fournisseur absent cote saisie -> probable', () => {
    const d = trouverDoublonsPennylane({ ...candidat, supplier_id: null }, [pennylane()])
    expect(d[0].niveau).toBe('probable')
  })

  it('un centime d ecart ne declenche rien', () => {
    expect(trouverDoublonsPennylane(candidat, [pennylane({ montant_ttc_cts: 12001 })])).toEqual([])
  })

  it('dans la fenetre de 7 jours, la raison donne l ecart', () => {
    const d = trouverDoublonsPennylane(candidat, [pennylane({ date: '2026-03-04' })])
    expect(d[0].raison).toBe("Même fournisseur, même montant, à 6 jours d'écart.")
  })

  it('un seul jour -> singulier', () => {
    const d = trouverDoublonsPennylane(candidat, [pennylane({ date: '2026-03-11' })])
    expect(d[0].raison).toBe("Même fournisseur, même montant, à 1 jour d'écart.")
  })

  it('au-dela de 7 jours, plus rien', () => {
    expect(trouverDoublonsPennylane(candidat, [pennylane({ date: '2026-03-01' })])).toEqual([])
  })

  it('une charge locale (sans pennylane_id) n est jamais un doublon', () => {
    expect(trouverDoublonsPennylane(candidat, [pennylane({ pennylane_id: null })])).toEqual([])
  })

  it('en edition, la charge ne se signale pas elle-meme', () => {
    const d = trouverDoublonsPennylane({ ...candidat, id: 'p1' }, [pennylane({ id: 'p1' })])
    expect(d).toEqual([])
  })

  it('montant nul ou negatif -> aucun controle', () => {
    expect(trouverDoublonsPennylane({ ...candidat, montant_ttc_cts: 0 }, [pennylane()])).toEqual([])
    expect(trouverDoublonsPennylane({ ...candidat, montant_ttc_cts: -12000 }, [pennylane()])).toEqual([])
  })

  it('montant TTC absent cote base -> ignore, pas de faux positif', () => {
    expect(trouverDoublonsPennylane(candidat, [pennylane({ montant_ttc_cts: null })])).toEqual([])
  })

  it('les certains passent devant, puis les plus proches en date', () => {
    const d = trouverDoublonsPennylane(candidat, [
      pennylane({ id: 'loin',    date: '2026-03-06', supplier_id: 'f2' }),
      pennylane({ id: 'proche',  date: '2026-03-11', supplier_id: 'f2' }),
      pennylane({ id: 'certain', date: '2026-03-13', supplier_id: 'f1' }),
    ])
    expect(d.map(x => x.charge.id)).toEqual(['certain', 'proche', 'loin'])
  })

  it('aucune charge connue -> tableau vide, pas d erreur', () => {
    expect(trouverDoublonsPennylane(candidat, [])).toEqual([])
  })
})
