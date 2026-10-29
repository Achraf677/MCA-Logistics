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
import { consignes, lireDocumentIA } from '../_shared/lectureDocument.ts';
import { jetonAcces, DOSSIER_MIME, NOM_DOSSIER_RACINE } from '../_shared/googleDrive.ts';
import {
  cheminDefaut, cheminsExistants, choisirChemin, completerDepuisOrigine, exemplesRangement, nomPropose, normaliserChemin, normaliserProposition,
  origineDuDocument, partieDuTexte, rapprocherTiers, rapprocherVehicule, pageDuNom, propositionTournee, salarieDuNom, typeDe, typeHabituel, typeSensibleDuNom,
  type Annuaire, type ClasseHistorique, type ContexteTournee, type DossierDrive,
} from '../_shared/triDocuments.ts';

const BUCKET = 'documents';
const MAX_PAR_APPEL = 6;
const SEUIL_CHEMIN = 0.4;

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

/** Fiches par identifiant : d'où vient un document (fiche salarié, véhicule, client) et qui l'a déposé (profil → salarié). */
async function annuaireDeLaSociete(service: SupabaseClient, companyId: string): Promise<Annuaire> {
  const lire = async (table: string, colonnes: string) => ((await service.from(table).select(colonnes).eq('company_id', companyId).limit(1000)).data ?? []) as unknown as Array<Record<string, string | null>>;
  const [salaries, vehicules, clients] = await Promise.all([lire('team_members', 'id, full_name, profile_id'), lire('vehicles', 'id, plate'), lire('clients', 'id, name')]);
  const a: Annuaire = { salaries: {}, salariesParProfil: {}, vehicules: {}, clients: {} };
  for (const r of salaries) { if (r.id && r.full_name) a.salaries[r.id] = r.full_name; if (r.profile_id && r.full_name) a.salariesParProfil[r.profile_id] = r.full_name; }
  for (const r of vehicules) if (r.id && r.plate) a.vehicules[r.id] = r.plate;
  for (const r of clients) if (r.id && r.name) a.clients[r.id] = r.name;
  return a;
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
  const { data: classes } = await service.from('documents').select('file_name, type_document, date_document, tiers, reference, drive_chemin').eq('company_id', acces.companyId).eq('statut_tri', 'classe').order('created_at', { ascending: false }).limit(1500);
  const classesInfos = (classes ?? []) as Array<ClasseHistorique & { file_name: string; date_document: string | null; reference: string | null }>;
  const pris = new Set(classesInfos.map(d => String(d.file_name).toLowerCase()));
  // Habitudes : les documents déjà rangés (du plus récent au plus ancien) apprennent le type et le dossier habituels d'un tiers.
  const historique: ClasseHistorique[] = classesInfos;
  const jourParis = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());

  // Ce que l'IA doit connaître pour ne pas inventer : fiches du site + arborescence réelle du Drive.
  const [clients, fournisseurs, salaries, plaques, existants, annuaire] = await Promise.all([
    noms(service, 'clients', 'name', acces.companyId), noms(service, 'suppliers', 'name', acces.companyId),
    noms(service, 'team_members', 'full_name', acces.companyId), noms(service, 'vehicles', 'plate', acces.companyId),
    dossiersDuDrive(service, acces.companyId), annuaireDeLaSociete(service, acces.companyId),
  ]);
  const systeme = consignes({ clients, fournisseurs, salaries, plaques, existants, exemples: exemplesRangement(historique, 25) });
  const connus = [...clients, ...fournisseurs, ...salaries];

  const resultats: Array<{ id: string; ok: boolean; raison?: string }> = [];
  for (const id of ids) {
    const { data: doc } = await service.from('documents')
      .select('id, company_id, storage_path, file_name, mime_type, category, entity_type, entity_id, notes, created_at, statut_tri, uploaded_by')
      .eq('id', id).maybeSingle();
    if (!doc || doc.company_id !== acces.companyId) { resultats.push({ id, ok: false, raison: 'document introuvable' }); continue; }
    if (doc.statut_tri === 'classe') { resultats.push({ id, ok: false, raison: 'déjà classé' }); continue; }

    // D'où vient le document : fiche salarié / véhicule / client, livraison (son client), qui l'a déposé.
    let clientDeLaLivraison: string | null = null;
    if (doc.entity_type === 'delivery' && doc.entity_id) {
      const { data: l } = await service.from('deliveries').select('client_id').eq('id', doc.entity_id).maybeSingle();
      clientDeLaLivraison = l?.client_id ? annuaire.clients[String(l.client_id)] ?? null : null;
    }
    const origine = origineDuDocument(doc, annuaire, clientDeLaLivraison);
    const partie = partieDuTexte(String(doc.file_name));

    // Feuille de route, synthèse, preuve d'arrêt : la tournée connaît déjà la date, le client et le salarié → pas de lecture IA.
    const tournee = await contexteTournee(service, doc);
    if (tournee) {
      tournee.salarie ??= origine.deposePar;
      const r = propositionTournee(tournee, String(doc.file_name), pris);
      pris.add(r.nom.toLowerCase());
      const choix = normaliserChemin(r.chemin, existants, r.chemin);
      const { error } = await service.from('documents').update({
        proposition: {
          type: r.type, date: r.date, tiers: r.tiers, tiers_connu: !!(tournee.client || tournee.salarie), montant_ttc_cts: null, reference: r.reference, resume: r.resume,
          confiance: { type: 1, date: r.date ? 1 : 0, tiers: r.tiers ? 1 : 0, montant: 1 }, vehicule: null, nom: r.nom, lu_via: 'tournee', propose_le: new Date().toISOString(),
          chemin: choix.chemin, chemin_nouveaux: choix.nouveaux, chemin_confiance: 1, chemin_via: 'origine', alternatives: [],
        },
        statut_tri: 'propose',
      }).eq('id', doc.id);
      resultats.push(error ? { id, ok: false, raison: 'enregistrement impossible' } : { id, ok: true });
      continue;
    }

    // Pièce personnelle ou secrète (identité, permis, casier, Carte Vitale, codes) : reconnue d'après le nom, JAMAIS envoyée à l'IA.
    const sensible = typeSensibleDuNom(String(doc.file_name));
    if (sensible) {
      // Le salarié vient d'abord de l'origine (fiche d'où vient la pièce, sinon celui qui l'a déposée), puis du nom du fichier.
      const parOrigine = origine.salarie ?? origine.deposePar;
      const salarie = parOrigine ?? salarieDuNom(String(doc.file_name), salaries);
      const dateDepot = String(doc.created_at).slice(0, 10);
      const date = typeDe(sensible)?.intemporel ? null : dateDepot;
      const regle = choisirChemin({ type: sensible, date, tiers: salarie, parOrigine: !!parOrigine }, { classes: historique, existants });
      const defaut = regle?.chemin ?? cheminDefaut({ type: sensible, date: dateDepot, tiers: salarie }, existants);
      const choix = normaliserChemin(defaut, existants, defaut);
      const nom = nomPropose({ type: sensible, dateDepot, tiers: salarie, partie }, String(doc.file_name), pris);
      pris.add(nom.toLowerCase());
      const { error } = await service.from('documents').update({
        proposition: {
          type: sensible, date, tiers: salarie, tiers_connu: !!salarie, montant_ttc_cts: null, reference: null,
          resume: 'Pièce personnelle ou secrète : reconnue d\'après son nom, non lue par l\'IA.', confiance: { type: 0.9, date: 1, tiers: salarie ? 0.9 : 0, montant: 1 },
          vehicule: null, partie, nom, lu_via: 'nom', propose_le: new Date().toISOString(), chemin: choix.chemin, chemin_nouveaux: choix.nouveaux, chemin_confiance: 0.9,
          chemin_via: regle?.via ?? 'transit', alternatives: [],
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

    const lu = await lireDocumentIA(apiKey, systeme, contexte, octets, doc.mime_type);
    if (!lu.ok) { console.error('trier-documents: lecture échouée', id, lu.raison); resultats.push({ id, ok: false, raison: lu.raison }); continue; }
    const { brut, luVia } = lu;

    const p = normaliserProposition(brut, jourParis);
    const tiersLu = rapprocherTiers(p.tiers, connus);
    const vehiculeLu = rapprocherVehicule(typeof brut?.vehicule === 'string' ? brut.vehicule : null, plaques);
    const dateDepot = String(doc.created_at).slice(0, 10);

    // Autodidacte : sans type lu, le type habituel du tiers ; l'origine du document complète le tiers et le véhicule manquants.
    let type = p.type;
    const confiance = { ...p.confiance };
    if (!type) { const h = typeHabituel(historique, tiersLu.nom); if (h) { type = h; confiance.type = Math.max(confiance.type, 0.6); } }
    const comp = completerDepuisOrigine({ type, tiers: tiersLu.nom, vehicule: vehiculeLu }, origine);
    const tiers = { nom: comp.tiers, connu: tiersLu.connu || (!tiersLu.nom && !!comp.tiers) };
    const vehicule = comp.vehicule;
    if (!p.tiers && comp.tiers) confiance.tiers = Math.max(confiance.tiers, 0.9);

    // Dossier : l'habitude de l'utilisateur, puis la règle de la convention ; sans règle, le choix de l'IA ; sinon le dossier de transit.
    const regle = choisirChemin({ type, date: p.date ?? (typeDe(type)?.intemporel ? null : dateDepot), tiers: tiers.nom, vehicule, parOrigine: comp.parOrigine }, { classes: historique, existants });
    const defaut = regle?.chemin ?? cheminDefaut({ type }, existants);
    const confIA = Math.min(1, Math.max(0, Number(brut?.chemin_confiance) || 0));
    const confChemin = regle ? 1 : confIA;
    const choix = normaliserChemin(regle?.chemin ?? (confIA >= SEUIL_CHEMIN ? brut?.chemin : null), existants, defaut);
    const cheminVia = regle?.via ?? (confIA >= SEUIL_CHEMIN ? 'ia' : 'transit');
    // Si une règle a décidé, le choix de l'IA reste proposé en « Sinon : » quand il diffère.
    const choixIA = regle && confIA >= SEUIL_CHEMIN && brut?.chemin ? normaliserChemin(brut.chemin, existants, defaut) : null;
    const alternatives = !choixIA || choixIA.chemin.join('/') === choix.chemin.join('/') ? [] : [choixIA];

    const nom = nomPropose({ date: p.date, dateDepot, type, tiers: tiers.nom, reference: p.reference, partie, vehicule }, String(doc.file_name), pris);
    pris.add(nom.toLowerCase());
    // Déjà rangé ? Même type, même date, même tiers et même référence qu'un document classé.
    const doublon = type && p.date && tiers.nom && p.reference
      ? (classesInfos.find(c => c.type_document === type && c.date_document === p.date && (c.tiers ?? '').toLowerCase() === tiers.nom!.toLowerCase() && (c.reference ?? '').toLowerCase() === p.reference!.toLowerCase())?.file_name ?? null)
      : null;
    const { error } = await service.from('documents')
      .update({
        proposition: {
          ...p, type, confiance, partie, tiers: tiers.nom, tiers_connu: tiers.connu, vehicule, nom, lu_via: luVia, propose_le: new Date().toISOString(), doublon_de: doublon,
          chemin: choix.chemin, chemin_nouveaux: choix.nouveaux, chemin_confiance: confChemin, chemin_via: cheminVia, alternatives,
        },
        statut_tri: 'propose',
      })
      .eq('id', doc.id);
    resultats.push(error ? { id, ok: false, raison: 'enregistrement impossible' } : { id, ok: true });
  }

  return jsonResponse({ ok: true, data: { resultats } });
});
