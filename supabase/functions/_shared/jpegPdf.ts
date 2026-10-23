// Photo JPEG → PDF d'une page — PUR (aucun Deno.*), testé par vitest. Pennylane lit les PDF reçus par mail ; une photo
// jointe telle quelle n'arrive pas dans « À traiter » (constaté le 23/10/2026 : un PDF à la main passe, la JPEG non).
// Le JPEG est inséré tel quel (DCTDecode), sans recompression ; l'orientation EXIF devient la rotation de la page.

export interface InfosJpeg { largeur: number; hauteur: number; composantes: number; orientation: number }

/** Lit taille, nombre de composantes et orientation EXIF (1 par défaut) ; null si ce n'est pas un JPEG lisible. */
export function infosJpeg(b: Uint8Array): InfosJpeg | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let orientation = 1;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2) return null;
    if (m === 0xe1 && len >= 16) orientation = orientationExif(b.subarray(i + 4, i + 2 + len)) ?? orientation;
    const sof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
    if (sof) {
      if (i + 10 > b.length) return null;
      const hauteur = (b[i + 5] << 8) | b[i + 6];
      const largeur = (b[i + 7] << 8) | b[i + 8];
      const composantes = b[i + 9];
      if (!largeur || !hauteur) return null;
      return { largeur, hauteur, composantes, orientation };
    }
    i += 2 + len;
  }
  return null;
}

function orientationExif(seg: Uint8Array): number | null {
  // « Exif\0\0 » puis en-tête TIFF.
  if (seg[0] !== 0x45 || seg[1] !== 0x78 || seg[2] !== 0x69 || seg[3] !== 0x66) return null;
  const t = seg.subarray(6);
  if (t.length < 8) return null;
  const petit = t[0] === 0x49;
  const u16 = (o: number) => (o + 2 <= t.length ? (petit ? t[o] | (t[o + 1] << 8) : (t[o] << 8) | t[o + 1]) : -1);
  const u32 = (o: number) => (o + 4 <= t.length
    ? (petit ? (t[o] | (t[o + 1] << 8) | (t[o + 2] << 16) | (t[o + 3] << 24)) : ((t[o] << 24) | (t[o + 1] << 16) | (t[o + 2] << 8) | t[o + 3])) >>> 0
    : -1);
  const ifd = u32(4);
  if (ifd < 0 || ifd + 2 > t.length) return null;
  const n = u16(ifd);
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (u16(e) === 0x0112) { const v = u16(e + 8); return v >= 1 && v <= 8 ? v : null; }
  }
  return null;
}

/** Rotation de page (degrés, sens horaire) qui remet la photo à l'endroit selon l'orientation EXIF. */
export function rotationPage(orientation: number): 0 | 90 | 180 | 270 {
  if (orientation === 3 || orientation === 4) return 180;
  if (orientation === 6 || orientation === 5) return 90;
  if (orientation === 8 || orientation === 7) return 270;
  return 0;
}

const enc = new TextEncoder();

/** PDF d'une page contenant le JPEG ; null si le JPEG n'est pas pris en charge (CMJN, illisible…) : on joint alors l'original. */
export function jpegVersPdf(jpeg: Uint8Array): Uint8Array | null {
  const info = infosJpeg(jpeg);
  if (!info || (info.composantes !== 1 && info.composantes !== 3)) return null;
  const echelle = 842 / Math.max(info.largeur, info.hauteur);
  const w = +(info.largeur * echelle).toFixed(2);
  const h = +(info.hauteur * echelle).toFixed(2);
  const espace = info.composantes === 1 ? '/DeviceGray' : '/DeviceRGB';
  const contenu = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  const morceaux: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const ajouter = (x: Uint8Array | string) => { const u = typeof x === 'string' ? enc.encode(x) : x; morceaux.push(u); pos += u.length; };
  const objet = (n: number, corps: string) => { offsets[n] = pos; ajouter(`${n} 0 obj\n${corps}\nendobj\n`); };

  ajouter('%PDF-1.4\n');
  objet(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objet(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objet(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Rotate ${rotationPage(info.orientation)} /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`);
  objet(4, `<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream`);
  offsets[5] = pos;
  ajouter(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${info.largeur} /Height ${info.hauteur} /ColorSpace ${espace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  ajouter(jpeg);
  ajouter('\nendstream\nendobj\n');
  const xref = pos;
  let table = 'xref\n0 6\n0000000000 65535 f \n';
  for (let n = 1; n <= 5; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  ajouter(`${table}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const sortie = new Uint8Array(pos);
  let o = 0;
  for (const m of morceaux) { sortie.set(m, o); o += m.length; }
  return sortie;
}
