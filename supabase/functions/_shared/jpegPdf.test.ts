import { describe, expect, it } from 'vitest';
import { infosJpeg, jpegVersPdf, rotationPage } from './jpegPdf';

/** JPEG minimal : SOI, (EXIF facultatif), SOF0 3 composantes, EOI. */
function jpeg(l: number, h: number, orientation?: number): Uint8Array {
  const sof = [0xff, 0xc0, 0x00, 0x11, 8, h >> 8, h & 255, l >> 8, l & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  const exif = orientation == null ? [] : [
    0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0,
    0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8,
    0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0,
  ];
  return new Uint8Array([0xff, 0xd8, ...exif, ...sof, 0xff, 0xd9]);
}

describe('jpegPdf', () => {
  it('lit taille et composantes', () => {
    expect(infosJpeg(jpeg(640, 480))).toEqual({ largeur: 640, hauteur: 480, composantes: 3, orientation: 1 });
  })
  it('lit l’orientation EXIF', () => {
    expect(infosJpeg(jpeg(640, 480, 6))?.orientation).toBe(6)
    expect(rotationPage(6)).toBe(90)
    expect(rotationPage(3)).toBe(180)
    expect(rotationPage(8)).toBe(270)
    expect(rotationPage(1)).toBe(0)
  })
  it('refuse ce qui n’est pas un JPEG', () => {
    expect(infosJpeg(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull()
    expect(jpegVersPdf(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull()
  })
  it('produit un PDF avec le JPEG et une table xref juste', () => {
    const pdf = jpegVersPdf(jpeg(640, 480, 6))!
    const txt = new TextDecoder('latin1').decode(pdf)
    expect(txt.startsWith('%PDF-1.4')).toBe(true)
    expect(txt.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(txt).toContain('/Filter /DCTDecode')
    expect(txt).toContain('/Rotate 90')
    const debut = Number(/startxref\n(\d+)/.exec(txt)![1])
    expect(txt.slice(debut, debut + 4)).toBe('xref')
    for (const m of txt.matchAll(/(\d{10}) 00000 n/g)) expect(txt.slice(Number(m[1])).match(/^\d+ 0 obj/)).not.toBeNull()
  })
})
