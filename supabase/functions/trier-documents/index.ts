// Edge `trier-documents` — l'IA lit des documents de l'Inbox (onglet Documents) et PROPOSE un classement :
// type, date, tiers (rattaché aux fiches clients / fournisseurs / salariés), montant, référence, véhicule, résumé,
// un nom rangé ET le dossier du Drive où le déposer (choisi parmi les dossiers EXISTANTS, sinon créé selon la convention).
// Rien n'est appliqué ici : la proposition est gardée dans `documents.proposition` (statut_tri = 'propose') ;
// c'est l'utilisateur qui confirme dans l'écran « À confirmer ».
//
// Exception : les documents d'une tournée de colis (feuilles de route, photos de synthèse, preuves d'arrêt) sont rangés d'après
// les DONNÉES de la tournée (date, client, salarié, page), sans lecture IA : `lu_via = 'tournee'`.
//
// Lecture : photo / image → modèle vision ; PDF contenant des photos (3 pages au plus) → les photos ; PDF « texte » → texte
// extrait (au mieux) ; sinon « illisible » (jamais de proposition inventée à partir du seul nom de fichier).
//
// POST { ids: string[] (1 à 6) } → { ok: true, data: { resultats: [{ id, ok, raison? }] } }
// Droit : président ou systeme.documents / update. Séquentiel (forfait IA gratuit : pas de rafale).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { exigerPermission } from '../_shared/auth.ts';
import { generateJson, generateJsonFromImage } from '../_shared/mistral.ts';
import { detecterImage, estPdf, jpegsDuPdf, versDataUrl } from '../_shared/justificatif.ts';
import { jetonAcces, DOSSIER_MIME, NOM_DOSSIER_RACINE } from '../_shared/googleDrive.ts';
import { texteDuPdf } from '../_shared/pdfTexte.ts';
import {
  TYPES_DOCUMENT, cheminDefaut, cheminsExistants, nomPropose, normaliserChemin, normaliserProposition, rapprocherTiers, rapprocherVehicule,
  pageDuNom, propositionTournee, type ContexteTournee, type DossierDrive, type PropositionBrute,
} from '../_shared/triDocuments.ts';

const BUCKET = 'documents';
const MAX_PAR_APPEL = 6;
const PAGES_MAX = 3;
const SEUIL_CHEMIN = 0.4;

const LISTE_TYPES = TYPES_DOCUMENT.map(t => `${t.cle} (${t.libelle})`).join(', ');

interface Contexte {
  clients: string[]
  fournisseurs: string[]
  salaries: string[]
  plaques: string[]
  existants: string[][]
}

function consignes(c: Contexte): string {
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
- reference : numéro de facture, de devis, de contrat, de lettre de voiture, de dossier…
- vehicule : plaque d'immatriculation si le document concerne un véhicule (carte grise, assurance, entretien, amende, carburant…), sinon null
- resume : une phrase courte qui dit ce qu'est le document
- chemin : le dossier du Drive où le ranger, sous forme de liste de noms de dossiers (3 niveaux au plus, jamais le nom du fichier).
  RÈGLE : choisis un chemin qui existe DÉJÀ dans la liste ci-dessous, tel quel, avec l'année du document si la liste range par année.
  Si aucun ne convient, crée un nouveau dossier en respectant la convention visible dans la liste (sinon : Dossier / Année).
  Exemples : ["Achats","Carburant","2026"] · ["Ventes","ASDIA","2026"] · ["Flotte","AB-123-CD","2025"] · ["Équipe","2026"].

Donne une confiance (0 à 1) SÉPARÉE pour le type, la date, le tiers, le montant et le chemin.
Réponds UNIQUEMENT en JSON :
{"type": <texte|null>, "type_confiance": <0-1>, "date": <texte|null>, "date_confiance": <0-1>, "tiers": <texte|null>, "tiers_confiance": <0-1>, "montant_ttc": <nombre|null>, "montant_confiance": <0-1>, "reference": <texte|null>, "vehicule": <texte|null>, "resume": <texte|null>, "chemin": [<texte>, …], "chemin_confiance": <0-1>}
${liste('CLIENTS connus', c.clients, 200)}${liste('FOURNISSEURS connus', c.fournisseurs, 200)}${liste('SALARIÉS', c.salaries, 50)}${liste('PLAQUES des véhicules', c.plaques, 50)}
Quand le tiers est l'un de ces noms, reprends-le exactement.${arbo}`;
}

const ENTITE: Record<string, string> = {
  delivery: 'joint à une livraison', vehicle: 'joint à un véhicule', client: 'joint à une fiche client', team_member: 'joint à la fiche d\'un salarié',
  tournee_colis: 'photo d\'une tournée de colis', arret_colis: 'photo d\'un arrêt de colis', charge: 'joint à une charge', depot: 'déposé dans l\'onglet Documents',
};

/** Dossiers existants du Drive sous la racine de rangement ; vide si le Drive n'est pas branché (la proposition suit alors la convention). */
async function dossiersDuDrive(service: SupabaseClient, companyId: string): Promise<string[][]> {
  try {
    const { data: tok } = await service.from('google_drive_tokens').select('refresh_token, root_folder_id').eq('company_id', companyId).maybeSingle();
    if (!tok?.refresh_token) return [];
    const token = await jetonAcces(String(tok.refresh_token));
    const h = { Authorization: `Bearer ${token}` };
    let racine = (tok.root_folder_id as string | null) ?? null;
    if (!racine) {
      const q = encodeURIComponent(`name='${NOM_DOSSIER_RACINE}' and 'root' in parents and mimeType='${DOSSIER_MIME}' and trashed=false`);
      const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`, { headers: h });
      racine = r.ok ? ((await r.json()).files?.[0]?.id ?? null) : null;
    }
    if (!racine) return [];
    const dossiers: DossierDrive[] = [];
    let page = '';
    for (let i = 0; i < 4; i++) {
      const q = encodeURIComponent(`mimeType='${DOSSIER_MIME}' and trashed=false`);
      const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,parents)&pageSize=1000${page}`, { headers: h });
      if (!r.ok) break;
      const j = await r.json();
      dossiers.push(...(j.files ?? []));
      if (!j.nextPageToken) break;
      page = `&pageToken=${encodeURIComponent(j.nextPageToken)}`;
    }
    return cheminsExistants(dossiers, racine);
  } catch (e) {
    console.error('trier-documents: arborescence Drive illisible', (e as Error)?.message);
    return [];
  }
}

/** Ce que la tournée sait du document (feuille de route, photo de synthèse, preuve d'arrêt), ou null si ce n'en est pas un. */
async function contexteTournee(
  service: SupabaseClient,
  doc: { id: string; entity_type: string | null; entity_id: string | null; notes: string | null; file_name: string; created_at: string },
): Promise<ContexteTournee | null> {
  if (!doc.entity_id) return null;
  const nature = doc.entity_type === 'tournee_colis' && (doc.notes === 'feuille' || doc.notes === 'synthese') ? doc.notes
    : doc.entity_type === 'arret_colis' ? 'arret' : null;
  if (!nature) return null;

  let tourneeId = doc.entity_id;
  let adresse: string | null = null;
  if (nature === 'arret') {
    const { data: a } = await service.from('tournees_colis_arrets').select('tournee_id, numero, rue, commune').eq('id', doc.entity_id).maybeSingle();
    if (!a?.tournee_id) return null;
    tourneeId = String(a.tournee_id);
    adresse = [[a.numero, a.rue].filter(Boolean).join(' '), a.commune].filter(Boolean).join(', ') || null;
  }
  // Tournée supprimée depuis : le fichier reste rangé comme document de tournée, à la date de son dépôt.
  const { data: tr } = await service.from('tournees_colis').select('date, client_id, member_id').eq('id', tourneeId).maybeSingle();
  const t = tr ?? { date: null, client_id: null, member_id: null };
  const [client, salarie] = await Promise.all([
    t.client_id ? service.from('clients').select('name').eq('id', t.client_id).maybeSingle() : Promise.resolve({ data: null }),
    t.member_id ? service.from('team_members').select('full_name').eq('id', t.member_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  let numero: number | null = null;
  if (nature === 'feuille') numero = pageDuNom(doc.file_name);
  if (nature === 'synthese') {
    const { data: freres } = await service.from('documents').select('id').eq('entity_type', 'tournee_colis').eq('entity_id', doc.entity_id).eq('notes', 'synthese').order('created_at').order('id');
    const rang = (freres ?? []).findIndex(f => f.id === doc.id);
    numero = rang >= 0 ? rang + 1 : null;
  }
  return {
    nature, date: (t.date as string | null) ?? String(doc.created_at).slice(0, 10), numero, adresse,
    client: (client.data as { name?: string } | null)?.name ?? null, salarie: (salarie.data as { full_name?: string } | null)?.full_name ?? null,
  };
}

async function noms(service: SupabaseClient, table: string, colonne: string, companyId: string): Promise<string[]> {
  const { data } = await service.from(table).select(colonne).eq('company_id', companyId).limit(500);
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(r => String(r[colonne] ?? '').trim()).filter(Boolean);
}

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

  const apiKey = Deno.env.get('MISTRAL_API_KEY') ?? '';

  const service = getServiceClient();
  const acces = await exigerPermission(req, service, 'systeme.documents', 'update');
  if (!acces.ok) return acces.response;

  // Noms déjà pris (documents classés) : une proposition ne doit jamais doubler un nom existant.
  const { data: classes } = await service.from('documents').select('file_name').eq('company_id', acces.companyId).eq('statut_tri', 'classe');
  const pris = new Set((classes ?? []).map(d => String(d.file_name).toLowerCase()));
  const jourParis = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());

  // Ce que l'IA doit connaître pour ne pas inventer : fiches du site + arborescence réelle du Drive.
  const [clients, fournisseurs, salaries, plaques, existants] = await Promise.all([
    noms(service, 'clients', 'name', acces.companyId), noms(service, 'suppliers', 'name', acces.companyId),
    noms(service, 'team_members', 'full_name', acces.companyId), noms(service, 'vehicles', 'plate', acces.companyId),
    dossiersDuDrive(service, acces.companyId),
  ]);
  const systeme = consignes({ clients, fournisseurs, salaries, plaques, existants });
  const connus = [...clients, ...fournisseurs, ...salaries];

  const resultats: Array<{ id: string; ok: boolean; raison?: string }> = [];
  for (const id of ids) {
    const { data: doc } = await service.from('documents')
      .select('id, company_id, storage_path, file_name, mime_type, category, entity_type, entity_id, notes, created_at, statut_tri')
      .eq('id', id).maybeSingle();
    if (!doc || doc.company_id !== acces.companyId) { resultats.push({ id, ok: false, raison: 'document introuvable' }); continue; }
    if (doc.statut_tri === 'classe') { resultats.push({ id, ok: false, raison: 'déjà classé' }); continue; }

    // Feuille de route, synthèse, preuve d'arrêt : la tournée connaît déjà la date, le client et le salarié → pas de lecture IA.
    const tournee = await contexteTournee(service, doc);
    if (tournee) {
      const r = propositionTournee(tournee, String(doc.file_name), pris);
      pris.add(r.nom.toLowerCase());
      const choix = normaliserChemin(r.chemin, existants, r.chemin);
      const { error } = await service.from('documents').update({
        proposition: {
          type: r.type, date: r.date, tiers: r.tiers, tiers_connu: !!tournee.client, montant_ttc_cts: null, reference: r.reference, resume: r.resume,
          confiance: { type: 1, date: r.date ? 1 : 0, tiers: r.tiers ? 1 : 0, montant: 1 }, vehicule: null, nom: r.nom, lu_via: 'tournee', propose_le: new Date().toISOString(),
          chemin: choix.chemin, chemin_nouveaux: choix.nouveaux, chemin_confiance: 1, alternatives: [],
        },
        statut_tri: 'propose',
      }).eq('id', doc.id);
      resultats.push(error ? { id, ok: false, raison: 'enregistrement impossible' } : { id, ok: true });
      continue;
    }

    if (!apiKey) { resultats.push({ id, ok: false, raison: 'lecture IA indisponible (clé manquante)' }); continue; }
    if (!doc.storage_path) { resultats.push({ id, ok: false, raison: 'fichier absent (ancien lien Drive)' }); continue; }

    const { data: blob } = await service.storage.from(BUCKET).download(doc.storage_path);
    if (!blob) { resultats.push({ id, ok: false, raison: 'fichier introuvable dans le stockage' }); continue; }
    const octets = new Uint8Array(await blob.arrayBuffer());

    const contexte = [
      `Nom du fichier : ${doc.file_name}`,
      doc.entity_type ? `Origine : ${ENTITE[doc.entity_type] ?? doc.entity_type}` : null,
      doc.category ? `Catégorie indiquée à l'envoi : ${doc.category}` : null,
    ].filter(Boolean).join('\n');

    let brut: (PropositionBrute & { vehicule?: unknown; chemin?: unknown; chemin_confiance?: unknown }) | null = null;
    let luVia: 'image' | 'texte' = 'image';
    try {
      const typeImage = detecterImage(octets) ?? (doc.mime_type?.startsWith('image/') ? doc.mime_type : null);
      const photos = !typeImage && estPdf(octets) ? jpegsDuPdf(octets, PAGES_MAX, 4 * 1024) : [];
      if (typeImage || photos.length > 0) {
        const images = typeImage ? [versDataUrl(octets, typeImage)] : photos.map(p => versDataUrl(p, 'image/jpeg'));
        brut = await generateJsonFromImage(apiKey, systeme, `${contexte}\n\nLe document à classer est ${images.length > 1 ? `les ${images.length} images jointes (pages du même document)` : 'l\'image jointe'}.`, images, 1500);
      } else if (estPdf(octets)) {
        const texte = await texteDuPdf(octets);
        if (!texte) { resultats.push({ id, ok: false, raison: 'PDF sans texte lisible par l\'IA' }); continue; }
        luVia = 'texte';
        brut = await generateJson(apiKey, systeme, `${contexte}\n\nTexte extrait du document :\n${texte}`);
      } else {
        resultats.push({ id, ok: false, raison: 'format non pris en charge' }); continue;
      }
    } catch (e) {
      console.error('trier-documents: lecture échouée', id, (e as Error)?.message);
      resultats.push({ id, ok: false, raison: 'lecture impossible pour le moment' }); continue;
    }

    const p = normaliserProposition(brut, jourParis);
    const tiers = rapprocherTiers(p.tiers, connus);
    const vehicule = rapprocherVehicule(typeof brut?.vehicule === 'string' ? brut.vehicule : null, plaques);
    const defaut = cheminDefaut({ type: p.type, date: p.date, vehicule });
    const confChemin = Math.min(1, Math.max(0, Number(brut?.chemin_confiance) || 0));
    const choix = normaliserChemin(confChemin >= SEUIL_CHEMIN ? brut?.chemin : null, existants, defaut);
    const alt = normaliserChemin(defaut, existants, defaut);
    const alternatives = alt.chemin.join('/') === choix.chemin.join('/') ? [] : [alt];

    const nom = nomPropose({ date: p.date, type: p.type, tiers: tiers.nom, montant_ttc_cts: p.montant_ttc_cts, reference: p.reference }, String(doc.file_name), pris);
    pris.add(nom.toLowerCase());
    const { error } = await service.from('documents')
      .update({
        proposition: {
          ...p, tiers: tiers.nom, tiers_connu: tiers.connu, vehicule, nom, lu_via: luVia, propose_le: new Date().toISOString(),
          chemin: choix.chemin, chemin_nouveaux: choix.nouveaux, chemin_confiance: confChemin, alternatives,
        },
        statut_tri: 'propose',
      })
      .eq('id', doc.id);
    resultats.push(error ? { id, ok: false, raison: 'enregistrement impossible' } : { id, ok: true });
  }

  return jsonResponse({ ok: true, data: { resultats } });
});
