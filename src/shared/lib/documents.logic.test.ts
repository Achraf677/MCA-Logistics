import { describe, it, expect } from 'vitest'
import { summarizeUploadBatch } from './documents.logic'

describe('summarizeUploadBatch', () => {
  it('tous les fichiers uploadés avec succès', () => {
    const s = summarizeUploadBatch(3, [])
    expect(s.variant).toBe('success')
    expect(s.message).toBe('3 justificatifs ajoutés')
  })

  it('un seul fichier uploadé avec succès (singulier)', () => {
    const s = summarizeUploadBatch(1, [])
    expect(s.message).toBe('1 justificatif ajouté')
  })

  it('cas mixte : succès + échecs — liste les fichiers en échec', () => {
    const s = summarizeUploadBatch(2, ['photo3.jpg'])
    expect(s.variant).toBe('error')
    expect(s.message).toBe('2 justificatifs ajoutés — échec : photo3.jpg')
  })

  it('tout a échoué : aucun succès', () => {
    const s = summarizeUploadBatch(0, ['a.pdf', 'b.pdf'])
    expect(s.variant).toBe('error')
    expect(s.message).toBe("Échec de l'upload : a.pdf, b.pdf")
  })
})
