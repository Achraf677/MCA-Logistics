// Lecture d'un document par l'IA, PARTAGÉE : `trier-documents` (Inbox) et `drive-renommer-ia` (fichiers déjà dans le Drive).
// Image → vision ; PDF contenant des photos (3 pages au plus) → les photos ; PDF « texte » → texte extrait ; sinon refus clair.
import { generateJson, generateJsonFromImage } from './mistral.ts';
import { detecterImage, estPdf, jpegsDuPdf, versDataUrl } from './justificatif.ts';
import { texteDuPdf } from './pdfTexte.ts';
import { TYPES_DOCUMENT, type PropositionBrute } from './triDocuments.ts';

const PAGES_MAX = 3;

const LISTE_TYPES = TYPES_DOCUMENT.map(t => `${t.cle} (${t.libelle})`).join(', ');

export interface Contexte {
  clients: string[]
  fournisseurs: string[]
  salaries: string[]
  plaques: string[]
  existants: string[][]
  /** Habitudes de l'utilisateur : « Type · tiers → dossier » tirés des documents déjà rangés. */
  exemples: string[]
}

export function consignes(c: Contexte): string {
  const liste = (titre: string, l: string[], max: number) => (l.length ? `\n${titre} :\n${l.slice(0, max).join(' ; ')}` : '')
  const arbo = c.existants.length
    ? `\nDOSSIERS DÉJÀ PRÉSENTS dans le Drive (chemins depuis la racine de rangement) :\n${c.existants.map(e => e.join(' / ')).join('\n')}`
    : '\nLe Drive ne contient pas encore de dossier de rangement : propose la convention Dossier / Année.'
  return `Tu classes les documents de MCA Logistics, petite société de transport routier français (véhicules de moins de 3,5 t, express et messagerie de colis, Strasbourg).
MCA Logistics est NOTRE société. Tu lis le document et tu extrais UNIQUEMENT ce qui est écrit. Tu n'inventes rien : si une information n'apparaît pas, réponds null.

SENS DES FACTURES : émise PAR MCA Logistics → facture_client, tiers = le destinataire (le client). Reçue PAR MCA Logistics → facture_fournisseur, tiers = l'émetteur (le fournisseur). Ticket de caisse, de carburant, de péage ou de restaurant → ticket, tiers = l'enseigne.

- type : une valeur parmi ${LISTE_TYPES}
- date : date d'ÉMISSION du document (AAAA-MM-JJ), pas l'échéance ni la date de paiement
- tiers : nom du client, du fournisseur, de l'organisme ou du salarié concerné (bulletin de paie, document salarié : le salarié)
- montant_ttc : total TTC à payer ou payé, en euros (nombre), seulement si le document en porte un
- reference : le numéro de pièce TEL QU'IMPRIMÉ (n° de facture, de devis, de contrat, de contravention, de dossier, d'ordre de transport…), sinon null. Jamais un libellé.
- vehicule : plaque d'immatriculation si le document concerne un véhicule (carte grise, assurance, entretien, amende, carburant…), sinon null
- resume : une phrase courte qui dit ce qu'est le document
- chemin : le dossier du Drive où le ranger, sous forme de liste de noms de dossiers (4 niveaux au plus, jamais le nom du fichier).
  RÈGLE : choisis un chemin qui existe DÉJÀ dans la liste ci-dessous, tel quel. Si aucun ne convient, crée un nouveau dossier en respectant la convention visible dans la liste.
  Exemples réels : ["Comptabilite & finances","Clients","CLIENTA","2026-07"] · ["Comptabilite & finances","Fournisseurs","ORGANISME"] · ["Vehicules et Flotte","RENAULT TRAFIC AB-123-CD","Amendes"] · ["Fiscal","TVA","2026-05"] · ["Assurances","Flotte automobile","FORD TRANSIT EF-456-GH"].

Donne une confiance (0 à 1) SÉPARÉE pour le type, la date, le tiers, le montant et le chemin.
Réponds UNIQUEMENT en JSON :
{"type": <texte|null>, "type_confiance": <0-1>, "date": <texte|null>, "date_confiance": <0-1>, "tiers": <texte|null>, "tiers_confiance": <0-1>, "montant_ttc": <nombre|null>, "montant_confiance": <0-1>, "reference": <texte|null>, "vehicule": <texte|null>, "resume": <texte|null>, "chemin": [<texte>, …], "chemin_confiance": <0-1>}
${liste('CLIENTS connus', c.clients, 200)}${liste('FOURNISSEURS connus', c.fournisseurs, 200)}${liste('SALARIÉS', c.salaries, 50)}${liste('PLAQUES des véhicules', c.plaques, 50)}
Quand le tiers est l'un de ces noms, reprends-le exactement.${arbo}${c.exemples.length ? `\nHABITUDES de rangement de l'utilisateur (type · tiers → dossier ; AAAA / AAAA-MM = année / mois du document) : suis-les quand elles s'appliquent :\n${c.exemples.join('\n')}` : ''}`;
}

export type LectureBrute = PropositionBrute & { vehicule?: unknown; chemin?: unknown; chemin_confiance?: unknown };

export type ResultatLecture =
  | { ok: true; brut: LectureBrute | null; luVia: 'image' | 'texte' }
  | { ok: false; raison: string };

/** Lit les octets d'un document (image ou PDF) avec la consigne `systeme` ; `contexte` = nom du fichier, origine… */
export async function lireDocumentIA(apiKey: string, systeme: string, contexte: string, octets: Uint8Array, mimeType: string | null | undefined): Promise<ResultatLecture> {
  try {
    const typeImage = detecterImage(octets) ?? (mimeType?.startsWith('image/') ? mimeType : null);
    const photos = !typeImage && estPdf(octets) ? jpegsDuPdf(octets, PAGES_MAX, 4 * 1024) : [];
    if (typeImage || photos.length > 0) {
      const images = typeImage ? [versDataUrl(octets, typeImage)] : photos.map(p => versDataUrl(p, 'image/jpeg'));
      const brut = await generateJsonFromImage(apiKey, systeme, `${contexte}\n\nLe document à classer est ${images.length > 1 ? `les ${images.length} images jointes (pages du même document)` : 'l\'image jointe'}.`, images, 1500);
      return { ok: true, brut, luVia: 'image' };
    }
    if (estPdf(octets)) {
      const texte = await texteDuPdf(octets);
      if (!texte) return { ok: false, raison: 'PDF sans texte lisible par l\'IA' };
      const brut = await generateJson(apiKey, systeme, `${contexte}\n\nTexte extrait du document :\n${texte}`);
      return { ok: true, brut, luVia: 'texte' };
    }
    return { ok: false, raison: 'format non pris en charge' };
  } catch (e) {
    console.error('lectureDocument: échec', (e as Error)?.message);
    return { ok: false, raison: 'lecture impossible pour le moment' };
  }
}
