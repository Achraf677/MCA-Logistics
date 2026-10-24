import { describe, expect, it } from 'vitest'
import { cheminAvecAnnee, cheminEnTexte, finParAnnee, lisibleParIA, lotsDe, tailleLisible, texteEnChemin } from './documents.logic'
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
})
