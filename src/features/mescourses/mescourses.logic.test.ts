import { describe, it, expect } from 'vitest'
import { libelleDateCourte, libelleCategorieDocument } from './mescourses.logic'

describe('libellés de Mes courses', () => {
  it('date courte pour l’en-tête', () => {
    expect(libelleDateCourte('2026-10-12')).toBe('lun. 12 oct.')
    expect(libelleDateCourte('nimporte')).toBe('nimporte')
  })
  it('libellés de catégorie de document', () => {
    expect(libelleCategorieDocument('POD')).toBe('Preuve de livraison')
    expect(libelleCategorieDocument('Autre')).toBe('Document')
    expect(libelleCategorieDocument(null)).toBe('Document')
  })
})
