// Texte d'un PDF « texte » (facture Pennylane, relevé…) — PUR, au mieux : extrait les chaînes des opérateurs Tj / TJ des
// flux de contenu (décompressés si besoin). Les polices à encodage maison (CID, hexadécimal) ne donnent rien : l'appelant
// traite un texte vide ou trop court comme « illisible ». Aucune OCR (le forfait Mistral ne l'ouvre pas).

const dec = new TextDecoder('latin1')

async function inflate(octets: Uint8Array): Promise<Uint8Array | null> {
  try {
    const flux = new Blob([octets as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))
    return new Uint8Array(await new Response(flux).arrayBuffer())
  } catch {
    return null
  }
}

function chaines(contenu: string): string[] {
  const sortie: string[] = []
  const lit = (s: string) => s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, c: string) => {
    if (c === 'n' || c === 'r') return ' '
    if (c === 't') return ' '
    if (/^[0-7]/.test(c)) return String.fromCharCode(parseInt(c, 8))
    return c
  })
  for (const m of contenu.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)) sortie.push(lit(m[1]))
  for (const m of contenu.matchAll(/\[((?:[^\]\\]|\\.)*)\]\s*TJ/g)) {
    const morceaux = [...m[1].matchAll(/\(((?:\\.|[^\\()])*)\)/g)].map(x => lit(x[1]))
    if (morceaux.length) sortie.push(morceaux.join(''))
  }
  return sortie
}

/** Texte lisible du PDF (6 000 caractères au plus), '' si rien d'exploitable. */
export async function texteDuPdf(octets: Uint8Array, max = 6000): Promise<string> {
  const brut = dec.decode(octets)
  const morceaux: string[] = []
  let total = 0
  for (const m of brut.matchAll(/stream\r?\n/g)) {
    const debut = (m.index ?? 0) + m[0].length
    const fin = brut.indexOf('endstream', debut)
    if (fin < 0) break
    // L'EOL avant « endstream » ne fait pas partie du flux (la décompression refuse des octets en trop).
    let bout = fin
    if (octets[bout - 1] === 0x0a) bout--
    if (octets[bout - 1] === 0x0d) bout--
    const donnees = octets.subarray(debut, bout)
    const decompresse = await inflate(donnees)
    const contenu = decompresse ? dec.decode(decompresse) : dec.decode(donnees)
    if (!/\b(Tj|TJ)\b/.test(contenu)) continue
    const t = chaines(contenu).join(' ').replace(/\s+/g, ' ').trim()
    if (t) { morceaux.push(t); total += t.length }
    if (total >= max) break
  }
  const texte = morceaux.join('\n').replace(/[^\x20-\x7E -ÿ\n]/g, '')
  // Trop peu de lettres = police à encodage maison : on ne fait pas lire du bruit à l'IA.
  const lettres = (texte.match(/[A-Za-zÀ-ÿ]/g) ?? []).length
  return lettres >= 20 ? texte.slice(0, max) : ''
}
