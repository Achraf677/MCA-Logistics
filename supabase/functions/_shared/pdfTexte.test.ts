import { describe, expect, it } from 'vitest'
import { deflateSync } from 'node:zlib'
import { texteDuPdf } from './pdfTexte'

const enc = new TextEncoder()
function pdf(contenu: string, compresse: boolean): Uint8Array {
  const flux = compresse ? new Uint8Array(deflateSync(Buffer.from(contenu, 'latin1'))) : enc.encode(contenu)
  const avant = enc.encode(`%PDF-1.4\n1 0 obj\n<< /Length ${flux.length}${compresse ? ' /Filter /FlateDecode' : ''} >>\nstream\n`)
  const apres = enc.encode('\nendstream\nendobj\n%%EOF\n')
  const out = new Uint8Array(avant.length + flux.length + apres.length)
  out.set(avant, 0); out.set(flux, avant.length); out.set(apres, avant.length + flux.length)
  return out
}
const CONTENU = 'BT /F1 12 Tf (FACTURE N\\260 2026-0412) Tj [(Total TTC ) -20 (1\\0562 340,00 EUR)] TJ (Client : ASDIA Transports Strasbourg) Tj ET'

describe('texteDuPdf', () => {
  it('lit un flux non compressé', async () => {
    const t = await texteDuPdf(pdf(CONTENU, false))
    expect(t).toContain('FACTURE')
    expect(t).toContain('Total TTC')
    expect(t).toContain('ASDIA')
  })
  it('lit un flux compressé (Flate)', async () => {
    const t = await texteDuPdf(pdf(CONTENU, true))
    expect(t).toContain('2026-0412')
    expect(t).toContain('EUR')
  })
  it('rend vide un PDF sans texte exploitable', async () => {
    expect(await texteDuPdf(pdf('q 100 0 0 100 0 0 cm /Im0 Do Q', false))).toBe('')
    expect(await texteDuPdf(enc.encode('pas un pdf'))).toBe('')
  })
})
