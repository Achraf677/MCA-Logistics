import { describe, expect, it } from 'vitest'
import { aAnalyser, aAppliquer, ligneDepuisProposition, lignesEnDouble, lignesVisibles, nomValide, type LigneRevue } from './renommage.logic'
import type { PropositionRenommage } from './documents.queries'

const prop = (o: Partial<PropositionRenommage> = {}): PropositionRenommage => ({
  id: 'f1', ancien: 'scan 1.pdf', nouveau: '2026-10-05_FACTURE_CLIENTA_FA-1.pdf', type: 'facture_client', tiers: 'CLIENTA', date: '2026-10-05', reference: 'FA-1', partie: null,
  deja_conforme: false, lu_via: 'image', ...o,
})
const ligne = (o: Partial<LigneRevue> = {}): LigneRevue => ({ id: 'f1', ancien: 'a.pdf', nouveau: 'B_C.pdf', coche: true, conforme: false, raison: null, luVia: 'image', ...o })

describe('aAnalyser : ce qu\'on envoie à l\'IA', () => {
  const f = (name: string, mimeType = 'application/pdf') => ({ id: name, name, mimeType })
  it('écarte les dossiers et les noms déjà conformes', () => {
    const r = aAnalyser([f('Sous-dossier', 'application/vnd.google-apps.folder'), f('2026-06-09_FACTURE_CLIENTA_1.pdf'), f('scan 2.pdf'), f('IMG_3794.jpeg', 'image/jpeg')])
    expect(r.envoyes.map(x => x.name)).toEqual(['scan 2.pdf', 'IMG_3794.jpeg'])
    expect(r.dejaConformes).toBe(1)
    expect(r.trop).toBe(0)
  })
  it('100 au plus par passage : le reste est annoncé', () => {
    const beaucoup = Array.from({ length: 130 }, (_, i) => f(`scan ${i}.pdf`))
    const r = aAnalyser(beaucoup)
    expect(r.envoyes).toHaveLength(100)
    expect(r.trop).toBe(30)
  })
})

describe('lignes de revue', () => {
  it('une proposition qui change le nom est cochée', () => {
    expect(ligneDepuisProposition(prop())).toMatchObject({ coche: true, conforme: false })
  })
  it('pas de nouveau nom (type inconnu) : décochée avec sa raison', () => {
    const l = ligneDepuisProposition(prop({ nouveau: 'scan 1.pdf', type: null, raison: 'Type de document non reconnu' }))
    expect(l).toMatchObject({ coche: false, conforme: true, raison: 'Type de document non reconnu' })
  })
  it('déjà conforme : décochée', () => {
    expect(ligneDepuisProposition(prop({ ancien: 'A_B.pdf', nouveau: 'A_B.pdf', deja_conforme: true }))).toMatchObject({ coche: false, conforme: true })
  })
  it('filtre « masquer les conformes »', () => {
    const l = [ligne({ id: '1' }), ligne({ id: '2', coche: false, conforme: true })]
    expect(lignesVisibles(l, true).map(x => x.id)).toEqual(['1'])
    expect(lignesVisibles(l, false)).toHaveLength(2)
  })
})

describe('noms en double et application', () => {
  it('deux lignes cochées au même nom : les deux sont signalées', () => {
    const l = [ligne({ id: '1', nouveau: 'X_Y.pdf' }), ligne({ id: '2', ancien: 'b.pdf', nouveau: 'x_y.pdf' })]
    expect([...lignesEnDouble(l, [])].sort()).toEqual(['1', '2'])
  })
  it('un nom déjà présent dans le dossier est signalé, pas celui qu\'on garde', () => {
    expect([...lignesEnDouble([ligne({ id: '1', nouveau: 'X_Y.pdf' })], ['X_Y.pdf'])]).toEqual(['1'])
    expect(lignesEnDouble([ligne({ id: '1', ancien: 'X_Y.pdf', nouveau: 'X_Y.pdf' })], ['X_Y.pdf']).size).toBe(0)
  })
  it('Appliquer : cochées, valides, changées, sans double', () => {
    const l = [
      ligne({ id: '1', nouveau: 'A_B.pdf' }), ligne({ id: '2', coche: false, nouveau: 'C_D.pdf' }), ligne({ id: '3', nouveau: '  ' }),
      ligne({ id: '4', ancien: 'z.pdf', nouveau: 'z.pdf' }), ligne({ id: '5', nouveau: 'E/F.pdf' }), ligne({ id: '6', nouveau: 'Dossier_Plein.pdf' }),
    ]
    expect(aAppliquer(l, ['Dossier_Plein.pdf']).map(x => x.id)).toEqual(['1'])
  })
  it('nom valide', () => {
    expect(nomValide('A_B.pdf')).toBe(true)
    expect(nomValide('')).toBe(false)
    expect(nomValide('a/b.pdf')).toBe(false)
    expect(nomValide('x'.repeat(201))).toBe(false)
  })
})
