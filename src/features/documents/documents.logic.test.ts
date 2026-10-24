import { describe, expect, it } from 'vitest'
import { cheminAvecAnnee, cheminEnTexte, cheminsDepuisDossiers, depuisQuand, optionsChemin, finParAnnee, lisibleParIA, lotsDe, tailleLisible, texteEnChemin } from './documents.logic'
import type { DocumentRow } from '../../shared/lib/documents.types'

const doc = (o: Partial<DocumentRow>): DocumentRow => ({
  id: 'd1', company_id: 'c', storage_path: 'c/x.pdf', drive_file_id: null, drive_link: null, file_name: 'x.pdf', mime_type: 'application/pdf',
  size_bytes: 2048, category: null, entity_type: 'depot', entity_id: null, uploaded_by: null, notes: null, created_at: '2026-10-21T08:00:00Z', ...o,
})

describe('documents', () => {
  it('lisible par l’IA : fichier chez nous, image ou PDF', () => {
    expect(lisibleParIA(doc({}))).toBe(true)
    expect(lisibleParIA(doc({ storage_path: null }))).toBe(false)
    expect(lisibleParIA(doc({ mime_type: 'application/zip', file_name: 'a.zip' }))).toBe(false)
    expect(lisibleParIA(doc({ mime_type: null, file_name: 'photo.JPG' }))).toBe(true)
  })
  it('lots et tailles', () => {
    expect(lotsDe([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]])
    expect(tailleLisible(500)).toBe('500 o')
    expect(tailleLisible(2048)).toBe('2 Ko')
    expect(tailleLisible(3 * 1024 * 1024)).toBe('3,0 Mo')
  })
  it('chemin de rangement', () => {
    expect(cheminEnTexte(['Achats', 'Carburant', '2026'])).toBe('Achats / Carburant / 2026')
    expect(texteEnChemin(' Achats / Carburant > 2026 / / ')).toEqual(['Achats', 'Carburant', '2026'])
    expect(texteEnChemin('a/b/c/d/e')).toEqual(['a', 'b', 'c', 'd'])
    expect(finParAnnee(['Ventes', '2025'])).toBe(true)
    expect(finParAnnee(['Ventes', 'ASDIA'])).toBe(false)
    expect(cheminAvecAnnee(['Achats', '2025'], '2026-03-02')).toEqual(['Achats', '2026'])
    expect(cheminAvecAnnee(['Achats', '2025'], null)).toEqual(['Achats', 'Sans date'])
    expect(cheminAvecAnnee(['Achats', 'Carburant'], '2026-03-02')).toEqual(['Achats', 'Carburant'])
  })
  it('arborescence du Drive et choix de dossier', () => {
    const d = [
      { id: 'a', name: 'Achats', parents: ['r'] }, { id: 'b', name: 'Carburant', parents: ['a'] }, { id: 'c', name: '2026', parents: ['b'] },
      { id: 'v', name: 'Ventes', parents: ['r'] }, { id: 'x', name: 'Ailleurs', parents: ['autre'] },
    ]
    const existants = cheminsDepuisDossiers(d, 'r')
    expect(existants).toEqual([['Achats'], ['Achats', 'Carburant'], ['Achats', 'Carburant', '2026'], ['Ventes']])
    const o = optionsChemin(existants, [['Achats', 'Péages', '2026'], ['Ventes']])
    expect(o[0]).toEqual({ valeur: 'Achats / Péages / 2026', libelle: 'Achats / Péages / 2026', detail: 'nouveau dossier' })
    expect(o.find(x => x.valeur === 'Ventes')?.detail).toBeUndefined()
    expect(o.filter(x => x.valeur === 'Ventes')).toHaveLength(1)
    expect(optionsChemin([], [['Achats', '2026']])[0].detail).toBeUndefined()
  })
  it('depuis quand', () => {
    const now = new Date('2026-10-24T15:00:00')
    expect(depuisQuand('2026-10-24T14:59:40', now)).toBe('à l\'instant')
    expect(depuisQuand('2026-10-24T14:40:00', now)).toBe('il y a 20 min')
    expect(depuisQuand('2026-10-24T12:00:00', now)).toBe('il y a 3 h')
    expect(depuisQuand('2026-10-23T09:05:00', now)).toBe('hier 09:05')
    expect(depuisQuand(null, now)).toBe('')
  })
})
