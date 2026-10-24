import { describe, expect, it } from 'vitest'
import { typeDeDocument } from './VisionneuseDocument'

describe('typeDeDocument', () => {
  it('le type annoncé gagne', () => {
    expect(typeDeDocument('https://x/y/ticket.pdf', 'image')).toBe('image')
  })
  it('lit l’extension avant le ?', () => {
    expect(typeDeDocument('https://x/o/sign/documents/a/photo.JPG?token=abc.pdf')).toBe('image')
    expect(typeDeDocument('https://x/o/sign/documents/a/facture.pdf?token=1')).toBe('pdf')
  })
  it('sans extension : PDF (factures Pennylane)', () => {
    expect(typeDeDocument('https://app.pennylane.com/public/invoice/pdf?x=1')).toBe('pdf')
  })
})
