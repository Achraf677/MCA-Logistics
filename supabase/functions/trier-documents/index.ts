// Edge Function `trier-documents` — l'IA lit des documents de l'Inbox (onglet Documents) et PROPOSE un classement :
// type, date, tiers (client / fournisseur / organisme), montant, référence, résumé, et un nom rangé.
// Rien n'est appliqué ici : la proposition est gardée dans `documents.proposition` (statut_tri = 'propose') ;
// c'est l'utilisateur qui confirme dans l'écran « À confirmer ».
//
// Lecture : photo / image → modèle vision ; PDF contenant une photo → la photo ; PDF « texte » → texte extrait (au mieux) ;
// sinon « illisible » (jamais de proposition inventée à partir du seul nom de fichier).
//
// POST { ids: string[] (1 à 6) } → { ok: true, data: { resultats: [{ id, ok, raison? }] } }
// Droit : président ou systeme.documents / update. Séquentiel (forfait IA gratuit : pas de rafale).
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { exigerPermission } from '../_shared/auth.ts';
import { generateJson, generateJsonFromImage } from '../_shared/mistral.ts';
import { detecterImage, estPdf, plusGrandJpeg, versDataUrl } from '../_shared/justificatif.ts';
import { texteDuPdf } from '../_shared/pdfTexte.ts';
import { TYPES_DOCUMENT, nomPropose, normaliserProposition, type PropositionBrute } from '../_shared/triDocuments.ts';

const BUCKET = 'documents';
const MAX_PAR_APPEL = 6;

const LISTE_TYPES = TYPES_DOCUMENT.map(t => `${t.cle} (${t.libelle})`).join(', ');

const SYSTEME = `Tu classes les documents d'une petite société de transport routier français (véhicules de moins de 3,5 t, express et messagerie, Strasbourg).
Tu lis le document et tu extrais UNIQUEMENT ce qui est écrit. Tu n'inventes rien : si une information n'apparaît pas, réponds null.

- type : une valeur parmi ${LISTE_TYPES}
- date : date du document au format AAAA-MM-JJ (date de facture, de ticket, du courrier…)
- tiers : nom du client, du fournisseur ou de l'organisme concerné (le commerçant d'un ticket, l'émetteur d'une facture reçue, le destinataire d'une facture émise par MCA Logistics)
- montant_ttc : total TTC en euros (nombre), seulement si le document en porte un
- reference : numéro de facture, de devis, de contrat, de lettre de voiture…
- resume : une phrase courte qui dit ce qu'est le document

Donne une confiance (0 à 1) SÉPARÉE pour le type, la date, le tiers et le montant.
Réponds UNIQUEMENT en JSON :
{"type": <texte|null>, "type_confiance": <0-1>, "date": <texte|null>, "date_confiance": <0-1>, "tiers": <texte|null>, "tiers_confiance": <0-1>, "montant_ttc": <nombre|null>, "montant_confiance": <0-1>, "reference": <texte|null>, "resume": <texte|null>}`;

const ENTITE: Record<string, string> = {
  delivery: 'joint à une livraison', vehicle: 'joint à un véhicule', client: 'joint à une fiche client', team_member: 'joint à la fiche d\'un salarié',
  tournee_colis: 'photo d\'une tournée de colis', arret_colis: 'photo d\'un arrêt de colis', charge: 'joint à une charge', depot: 'déposé dans l\'onglet Documents',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  let ids: string[] = [];
  try {
    const b = await req.json();
    ids = Array.isArray(b?.ids) ? b.ids.filter((x: unknown): x is string => typeof x === 'string').slice(0, MAX_PAR_APPEL) : [];
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400);
  }
  if (ids.length === 0) return jsonResponse({ ok: false, error: 'ids requis' }, 400);

  const apiKey = Deno.env.get('MISTRAL_API_KEY');
  if (!apiKey) return jsonResponse({ ok: false, error: 'missing MISTRAL_API_KEY' }, 500);

  const service = getServiceClient();
  const acces = await exigerPermission(req, service, 'systeme.documents', 'update');
  if (!acces.ok) return acces.response;

  // Noms déjà pris (documents classés) : une proposition ne doit jamais doubler un nom existant.
  const { data: classes } = await service.from('documents').select('file_name').eq('company_id', acces.companyId).eq('statut_tri', 'classe');
  const pris = new Set((classes ?? []).map(d => String(d.file_name).toLowerCase()));
  const jourParis = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());

  const resultats: Array<{ id: string; ok: boolean; raison?: string }> = [];
  for (const id of ids) {
    const { data: doc } = await service.from('documents')
      .select('id, company_id, storage_path, file_name, mime_type, category, entity_type, statut_tri')
      .eq('id', id).maybeSingle();
    if (!doc || doc.company_id !== acces.companyId) { resultats.push({ id, ok: false, raison: 'document introuvable' }); continue; }
    if (doc.statut_tri === 'classe') { resultats.push({ id, ok: false, raison: 'déjà classé' }); continue; }
    if (!doc.storage_path) { resultats.push({ id, ok: false, raison: 'fichier absent (ancien lien Drive)' }); continue; }

    const { data: blob } = await service.storage.from(BUCKET).download(doc.storage_path);
    if (!blob) { resultats.push({ id, ok: false, raison: 'fichier introuvable dans le stockage' }); continue; }
    const octets = new Uint8Array(await blob.arrayBuffer());

    const contexte = [
      `Nom du fichier : ${doc.file_name}`,
      doc.entity_type ? `Origine : ${ENTITE[doc.entity_type] ?? doc.entity_type}` : null,
      doc.category ? `Catégorie indiquée à l'envoi : ${doc.category}` : null,
    ].filter(Boolean).join('\n');

    let brut: PropositionBrute | null = null;
    let luVia: 'image' | 'texte' = 'image';
    try {
      const typeImage = detecterImage(octets) ?? (doc.mime_type?.startsWith('image/') ? doc.mime_type : null);
      const jpegPdf = !typeImage && estPdf(octets) ? plusGrandJpeg(octets) : null;
      if (typeImage || jpegPdf) {
        const image = typeImage ? versDataUrl(octets, typeImage) : versDataUrl(jpegPdf!, 'image/jpeg');
        brut = await generateJsonFromImage<PropositionBrute>(apiKey, SYSTEME, `${contexte}\n\nLe document à classer est l'image jointe.`, image);
      } else if (estPdf(octets)) {
        const texte = await texteDuPdf(octets);
        if (!texte) { resultats.push({ id, ok: false, raison: 'PDF sans texte lisible par l\'IA' }); continue; }
        luVia = 'texte';
        brut = await generateJson<PropositionBrute>(apiKey, SYSTEME, `${contexte}\n\nTexte extrait du document :\n${texte}`);
      } else {
        resultats.push({ id, ok: false, raison: 'format non pris en charge' }); continue;
      }
    } catch (e) {
      console.error('trier-documents: lecture échouée', id, (e as Error)?.message);
      resultats.push({ id, ok: false, raison: 'lecture impossible pour le moment' }); continue;
    }

    const p = normaliserProposition(brut, jourParis);
    const nom = nomPropose({ date: p.date, type: p.type, tiers: p.tiers, montant_ttc_cts: p.montant_ttc_cts, reference: p.reference }, String(doc.file_name), pris);
    pris.add(nom.toLowerCase());
    const { error } = await service.from('documents')
      .update({ proposition: { ...p, nom, lu_via: luVia, propose_le: new Date().toISOString() }, statut_tri: 'propose' })
      .eq('id', doc.id);
    resultats.push(error ? { id, ok: false, raison: 'enregistrement impossible' } : { id, ok: true });
  }

  return jsonResponse({ ok: true, data: { resultats } });
});
