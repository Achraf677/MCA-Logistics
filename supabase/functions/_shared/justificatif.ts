// Récupération d'un justificatif sous forme d'IMAGE, prête à être lue par un
// modèle vision (Mistral chat/completions + `image_url`).
//
// Pourquoi ce détour plutôt que l'OCR Mistral (`/v1/ocr`) :
//   - le forfait gratuit Mistral ne donne PAS accès à `mistral-ocr-latest`
//     (429 code 1300 systématique, aucune lecture réussie jamais — diagnostic
//     du 29/09/2026), alors que `ministral-14b-2512`, lui, est ouvert et sait
//     lire des images ;
//   - un modèle vision lit des images, pas des PDF. Or Pennylane sert TOUS les
//     justificatifs en PDF (`/public/invoice/pdf?...`), y compris les photos de
//     tickets, qu'il emballe dans un PDF. On ressort donc la photo du PDF.
//
// Et pourquoi une URL FRAÎCHE : `public_file_url` est une URL signée à durée
// limitée. Celle stockée dans `charges.receipt_url` au moment du sync expire —
// la télécharger plus tard renvoie 400. On redemande l'URL à Pennylane juste
// avant de lire.
import { PENNYLANE_BASE, pennylaneToken, pennylaneHeaders } from './pennylane.ts';

/** Au-delà, on n'essaie même pas : ni un ticket ni une facture ne pèse ça. */
const TAILLE_MAX_OCTETS = 15 * 1024 * 1024;

/** Plus petit qu'une photo de ticket : c'est un logo ou une icône. */
const TAILLE_MIN_PHOTO = 15 * 1024;

export type ResultatImage =
  | { ok: true; dataUrl: string }
  | { ok: false; raison: 'lien expiré' | 'format non pris en charge' | 'téléchargement impossible' };

/** URL signée toute neuve du fichier d'une facture fournisseur Pennylane. */
export async function urlFraichePennylane(pennylaneId: string): Promise<string | null> {
  try {
    const res = await fetch(`${PENNYLANE_BASE}/supplier_invoices/${pennylaneId}`, {
      headers: pennylaneHeaders(pennylaneToken()),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    return typeof data.public_file_url === 'string' ? data.public_file_url : null;
  } catch {
    return null;
  }
}

/**
 * Télécharge le justificatif et le rend sous forme d'image (data URL base64).
 * Image directe → telle quelle. PDF → la plus grande photo JPEG qu'il contient.
 * PDF sans photo (facture 100 % texte/vectorielle) → non pris en charge ici.
 */
export async function telechargerEnImage(url: string): Promise<ResultatImage> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  } catch {
    return { ok: false, raison: 'téléchargement impossible' };
  }
  if (!res.ok) {
    return { ok: false, raison: res.status === 400 || res.status === 403 ? 'lien expiré' : 'téléchargement impossible' };
  }
  const octets = new Uint8Array(await res.arrayBuffer());
  if (octets.length === 0 || octets.length > TAILLE_MAX_OCTETS) {
    return { ok: false, raison: 'téléchargement impossible' };
  }

  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const typeImage = type.startsWith('image/') ? type : detecterImage(octets);
  if (typeImage) return { ok: true, dataUrl: `data:${typeImage};base64,${versBase64(octets)}` };

  if (estPdf(octets)) {
    const jpeg = plusGrandJpeg(octets);
    if (jpeg && jpeg.length >= TAILLE_MIN_PHOTO) {
      return { ok: true, dataUrl: `data:image/jpeg;base64,${versBase64(jpeg)}` };
    }
  }
  console.log('justificatif: format non pris en charge', type, octets.length, estPdf(octets));
  return { ok: false, raison: 'format non pris en charge' };
}

function estPdf(o: Uint8Array): boolean {
  return o[0] === 0x25 && o[1] === 0x50 && o[2] === 0x44 && o[3] === 0x46; // %PDF
}

function detecterImage(o: Uint8Array): string | null {
  if (o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return 'image/jpeg';
  if (o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47) return 'image/png';
  if (o[0] === 0x52 && o[1] === 0x49 && o[2] === 0x46 && o[3] === 0x46
    && o[8] === 0x57 && o[9] === 0x45 && o[10] === 0x42 && o[11] === 0x50) return 'image/webp';
  return null;
}

const MOT_STREAM = new TextEncoder().encode('stream');
const MOT_ENDSTREAM = new TextEncoder().encode('endstream');

function indexDe(o: Uint8Array, motif: Uint8Array, depuis: number): number {
  const premier = motif[0];
  const fin = o.length - motif.length;
  for (let i = depuis; i <= fin; i++) {
    if (o[i] !== premier) continue;
    let j = 1;
    while (j < motif.length && o[i + j] === motif[j]) j++;
    if (j === motif.length) return i;
  }
  return -1;
}

/**
 * Plus grande image JPEG (filtre DCTDecode) embarquée dans un PDF.
 *
 * Un flux DCTDecode EST un fichier JPEG complet : il suffit de le découper
 * entre `stream` et `endstream`, sans rien décoder — quelques millisecondes de
 * CPU, compatible avec la limite des Edge Functions. On reconnaît le JPEG à
 * sa signature (FF D8) plutôt qu'en analysant le dictionnaire du PDF.
 */
export function plusGrandJpeg(o: Uint8Array): Uint8Array | null {
  let meilleur: Uint8Array | null = null;
  let pos = 0;
  for (;;) {
    const s = indexDe(o, MOT_STREAM, pos);
    if (s < 0) break;
    let debut = s + MOT_STREAM.length;
    if (o[debut] === 0x0d) debut++;
    if (o[debut] === 0x0a) debut++;
    const fin = indexDe(o, MOT_ENDSTREAM, debut);
    if (fin < 0) break;
    if (o[debut] === 0xff && o[debut + 1] === 0xd8) {
      let f = fin;
      while (f > debut && (o[f - 1] === 0x0a || o[f - 1] === 0x0d)) f--;
      if (!meilleur || f - debut > meilleur.length) meilleur = o.subarray(debut, f);
    }
    pos = fin + MOT_ENDSTREAM.length;
  }
  return meilleur;
}

function versBase64(o: Uint8Array): string {
  let binaire = '';
  const BLOC = 0x8000;
  for (let i = 0; i < o.length; i += BLOC) {
    binaire += String.fromCharCode(...o.subarray(i, i + BLOC));
  }
  return btoa(binaire);
}
