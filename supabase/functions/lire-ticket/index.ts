// Edge Function `lire-ticket` — lit un ticket de dépense (vision Mistral) et PRÉREMPLIT les cases vides du justificatif :
// montant TTC, date, catégorie, fournisseur (seulement s'il existe déjà dans le site, sans doute possible).
//
// Garanties (comme `lire-facture`) : on propose, on ne décide pas ; ce que le salarié a déjà saisi n'est jamais écrasé ;
// un champ douteux ou invraisemblable reste vide ; une panne de l'IA ne bloque rien (réponse ok + raison, ticket intact).
// Le résultat est gardé sur le ticket (`ocr_lecture`, `ocr_lu_le`) : un ticket lu n'est pas relu (sauf `force`).
//
// POST { ticket_id, force? } → { ok: true, data: { lu: Lecture | null, rempli: string[], raison? } }
// Droit : le salarié qui a déposé le ticket (lecture lancée dès le dépôt), sinon président ou finance.charges / update.
// La lecture n'a lieu qu'une fois par ticket (`ocr_lu_le`) ; la TVA n'est plus lue (Pennylane la lit lui-même).
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { exigerPermission } from '../_shared/auth.ts';
import { generateJsonFromImage } from '../_shared/mistral.ts';
import { detecterImage, estPdf, plusGrandJpeg, versDataUrl } from '../_shared/justificatif.ts';
import { colonnesAPrerempli, fournisseurCorrespondant, normaliserLecture, type LectureBrute } from '../_shared/lectureTicket.ts';

const BUCKET = 'documents';

const SYSTEME = `Tu lis un ticket de caisse ou une facture pour une société de transport routier française.
Tu extrais UNIQUEMENT ce qui est écrit noir sur blanc. Tu n'estimes rien, tu ne calcules rien. Si une information n'apparaît pas, réponds null.

- fournisseur : nom du commerçant (ex. "TOTALENERGIES", "O'TACOS", "AUTOROUTES SANEF")
- date : date du ticket au format AAAA-MM-JJ
- total_ttc : montant total TTC payé, en euros (nombre, ex. 17.50)
- categorie : une valeur parmi carburant, peage, parking, repas, entretien, fournitures, autre

Donne une confiance (0 à 1) SÉPARÉE pour chaque champ.
Réponds UNIQUEMENT en JSON :
{"fournisseur": <texte|null>, "fournisseur_confiance": <0-1>, "date": <texte|null>, "date_confiance": <0-1>, "total_ttc": <nombre|null>, "total_confiance": <0-1>, "categorie": <texte|null>, "categorie_confiance": <0-1>}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  let ticketId = '';
  let force = false;
  try {
    const b = await req.json();
    ticketId = typeof b?.ticket_id === 'string' ? b.ticket_id : '';
    force = b?.force === true;
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400);
  }
  if (!ticketId) return jsonResponse({ ok: false, error: 'ticket_id requis' }, 400);

  const apiKey = Deno.env.get('MISTRAL_API_KEY');
  if (!apiKey) return jsonResponse({ ok: false, error: 'missing MISTRAL_API_KEY' }, 500);

  const service = getServiceClient();
  const { data: ticketBrut } = await service
    .from('receipts_inbox')
    .select('id, company_id, uploaded_by, statut, storage_path, mime_type, montant_ttc_cts, date_depense, categorie, supplier_id, ocr_lu_le')
    .eq('id', ticketId).maybeSingle();
  if (!ticketBrut) return jsonResponse({ ok: false, error: 'Justificatif introuvable' }, 404);
  const t = ticketBrut;

  // Le salarié qui dépose le ticket lance la lecture ; le bureau (droit finance.charges) peut aussi la lancer.
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const { data: u } = jwt ? await service.auth.getUser(jwt) : { data: null };
  const deposant = !!u?.user && t.uploaded_by === u.user.id;
  let companyId = t.company_id as string;
  if (!deposant) {
    const acces = await exigerPermission(req, service, 'finance.charges', 'update');
    if (!acces.ok) return acces.response;
    if (t.company_id !== acces.companyId) return jsonResponse({ ok: false, error: 'Justificatif introuvable' }, 404);
    companyId = acces.companyId;
  }
  if (t.statut !== 'a_traiter') return jsonResponse({ ok: true, data: { lu: null, rempli: [], raison: 'déjà traité' } });
  if (t.ocr_lu_le && !(force && !deposant)) return jsonResponse({ ok: true, data: { lu: null, rempli: [], raison: 'déjà lu' } });

  // Une panne ne se mémorise pas (le ticket reste relisible) ; un document illisible, si.
  const sansLecture = (raison: string) => jsonResponse({ ok: true, data: { lu: null, rempli: [], raison } });

  const { data: blob } = await service.storage.from(BUCKET).download(t.storage_path);
  if (!blob) return sansLecture('fichier introuvable');
  const octets = new Uint8Array(await blob.arrayBuffer());
  const typeImage = detecterImage(octets) ?? (t.mime_type?.startsWith('image/') ? t.mime_type : null);
  const jpegPdf = !typeImage && estPdf(octets) ? plusGrandJpeg(octets) : null;
  const image = typeImage ? versDataUrl(octets, typeImage) : jpegPdf ? versDataUrl(jpegPdf, 'image/jpeg') : null;

  const memoriser = async (donnees: Record<string, unknown>, maj: Record<string, unknown> = {}) => {
    await service.from('receipts_inbox').update({ ...maj, ocr_lecture: donnees, ocr_lu_le: new Date().toISOString() }).eq('id', t.id);
  };
  if (!image) { await memoriser({ raison: 'format non pris en charge' }); return sansLecture('format non pris en charge'); }

  let brut: LectureBrute;
  try {
    brut = await generateJsonFromImage<LectureBrute>(apiKey, SYSTEME, 'Le ticket à lire est l\'image jointe.', image);
  } catch (e) {
    console.error('lire-ticket: lecture vision échouée', ticketId, (e as Error)?.message);
    return sansLecture('lecture impossible pour le moment');
  }

  const jourParis = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const lu = normaliserLecture(brut, jourParis);

  const { data: fournisseurs } = await service.from('suppliers').select('id, name').eq('company_id', companyId).eq('active', true);
  const fournisseurId = fournisseurCorrespondant(lu.fournisseur, (fournisseurs ?? []) as Array<{ id: string; name: string }>);
  const maj = colonnesAPrerempli(t, lu, fournisseurId);
  const rempli = Object.keys(maj);

  await memoriser({ lu, rempli, fournisseur_id: fournisseurId }, maj);
  return jsonResponse({ ok: true, data: { lu, rempli } });
});
