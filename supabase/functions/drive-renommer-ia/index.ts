// Edge `drive-renommer-ia` — PROPOSE un nouveau nom (convention de la société) pour des fichiers DÉJÀ rangés dans le Drive.
// Rien n'est renommé ici : le site applique ensuite, fichier par fichier, avec l'Edge `drive-rename`.
//
// POST { fichiers: [{ id, nom }] (1 à 6), reserves?: string[] (noms déjà proposés dans les paquets précédents du même dossier) }
//   → { ok: true, data: { resultats: [{ id, ancien, nouveau, type, tiers, date, reference, partie, deja_conforme, lu_via, raison? }] } }
// Droit : systeme.documents / update ET accès au Drive (président ou drive_access).
//
// Lecture : image / PDF ≤ 15 Mo par l'IA (`_shared/lectureDocument.ts`, la même que `trier-documents`) ; Google Docs / Sheets, Word, Excel, autres :
// d'après le NOM et le dossier seulement. CONFIDENTIALITÉ : une pièce sensible (nom) ou un fichier situé dans Sécurité, Direction, Social et RH
// n'est JAMAIS envoyé à l'IA ; le chemin du dossier est relu côté serveur (jamais pris sur la parole du site). Aucun contenu ni nom de personne n'est journalisé.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { exigerPermission } from '../_shared/auth.ts';
import { accesDrive, DOSSIER_MIME } from '../_shared/googleDrive.ts';
import { consignes, lireDocumentIA } from '../_shared/lectureDocument.ts';
import { cheminsExistants, normaliserProposition, rapprocherTiers, rapprocherVehicule, type DossierDrive } from '../_shared/triDocuments.ts';
import {
  SANS_ORIGINE, TYPES_CLIENT, TYPES_SALARIE, completerDepuisOrigine, dossierConfidentiel, estNomConforme, exemplesRangement, nomPropose, origineDuDossier,
  partieDuTexte, salarieDuNom, typeDe, typeHabituel, typeSensibleDuNom, type ClasseHistorique,
} from '../_shared/conventionDocuments.ts';

const MAX_PAR_APPEL = 6;
const MAX_OCTETS = 15 * 1024 * 1024;
const API = 'https://www.googleapis.com/drive/v3';

interface Resultat {
  id: string; ancien: string; nouveau: string; type: string | null; tiers: string | null; date: string | null; reference: string | null; partie: string | null
  deja_conforme: boolean; lu_via: 'image' | 'texte' | 'nom'; raison?: string
}

async function noms(service: SupabaseClient, table: string, colonne: string, companyId: string): Promise<string[]> {
  const { data } = await service.from(table).select(colonne).eq('company_id', companyId).limit(500);
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(r => String(r[colonne] ?? '').trim()).filter(Boolean);
}

/** Dossiers existants sous la racine de rangement (l'IA choisit les noms de dossier d'après eux ; ici ils servent aux exemples et au contexte). */
async function dossiersSousRacine(token: string, racineId: string | null): Promise<string[][]> {
  if (!racineId) return [];
  try {
    const dossiers: DossierDrive[] = [];
    let page = '';
    for (let i = 0; i < 4; i++) {
      const q = encodeURIComponent(`mimeType='${DOSSIER_MIME}' and trashed=false`);
      const r = await fetch(`${API}/files?q=${q}&fields=nextPageToken,files(id,name,parents)&pageSize=1000${page}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) break;
      const j = await r.json();
      dossiers.push(...(j.files ?? []));
      if (!j.nextPageToken) break;
      page = `&pageToken=${encodeURIComponent(j.nextPageToken)}`;
    }
    return cheminsExistants(dossiers, racineId);
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  let fichiers: Array<{ id: string; nom: string }> = [];
  let reserves: string[] = [];
  try {
    const b = await req.json();
    fichiers = (Array.isArray(b?.fichiers) ? b.fichiers : [])
      .filter((f: unknown): f is { id: string; nom: string } => !!f && typeof (f as { id?: unknown }).id === 'string' && /^[\w-]{8,}$/.test((f as { id: string }).id))
      .slice(0, MAX_PAR_APPEL);
    reserves = (Array.isArray(b?.reserves) ? b.reserves : []).filter((x: unknown): x is string => typeof x === 'string').slice(0, 500);
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400);
  }
  if (fichiers.length === 0) return jsonResponse({ ok: false, error: 'fichiers requis' }, 400);

  const service = getServiceClient();
  const droit = await exigerPermission(req, service, 'systeme.documents', 'update');
  if (!droit.ok) return droit.response;
  const a = await accesDrive(req, service);
  if (!a.ok) return a.response;
  const h = { Authorization: `Bearer ${a.token}` };
  const apiKey = Deno.env.get('MISTRAL_API_KEY') ?? '';
  const jourParis = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());

  const [clients, fournisseurs, salaries, plaques, existants, classesBrut] = await Promise.all([
    noms(service, 'clients', 'name', a.companyId), noms(service, 'suppliers', 'name', a.companyId),
    noms(service, 'team_members', 'full_name', a.companyId), noms(service, 'vehicles', 'plate', a.companyId),
    dossiersSousRacine(a.token, a.racineId),
    service.from('documents').select('type_document, tiers, drive_chemin').eq('company_id', a.companyId).eq('statut_tri', 'classe').order('trie_le', { ascending: false, nullsFirst: false }).limit(500),
  ]);
  const historique = ((classesBrut.data ?? []) as ClasseHistorique[]);
  const connus = [...clients, ...fournisseurs, ...salaries];
  const systeme = consignes({ clients, fournisseurs, salaries, plaques, existants, exemples: exemplesRangement(historique, 25) });

  // Chemin complet d'un dossier du Drive (relu ici : le site ne peut pas se faire passer pour un dossier « sans danger »).
  const caches = { chemins: new Map<string, Promise<string[]>>(), noms: new Map<string, Promise<Set<string>>>() };
  const cheminDe = (id: string, profondeur = 0): Promise<string[]> => {
    let p = caches.chemins.get(id);
    if (!p) {
      p = (async () => {
        if (profondeur > 10) return [];
        const r = await fetch(`${API}/files/${id}?fields=name,parents`, { headers: h });
        if (!r.ok) return [];
        const j = await r.json() as { name?: string; parents?: string[] };
        const haut = j.parents?.[0] ? await cheminDe(j.parents[0], profondeur + 1) : [];
        return j.parents?.[0] ? [...haut, String(j.name ?? '')] : [];
      })();
      caches.chemins.set(id, p);
    }
    return p;
  };
  const nomsDuDossier = (id: string): Promise<Set<string>> => {
    let p = caches.noms.get(id);
    if (!p) {
      p = (async () => {
        const q = encodeURIComponent(`'${id}' in parents and trashed=false`);
        const r = await fetch(`${API}/files?q=${q}&fields=files(name)&pageSize=1000`, { headers: h });
        const j = r.ok ? await r.json() as { files?: Array<{ name?: string }> } : { files: [] };
        return new Set((j.files ?? []).map(f => String(f.name ?? '').toLowerCase()));
      })();
      caches.noms.set(id, p);
    }
    return p;
  };

  const pris = new Map<string, Set<string>>(); // par dossier : noms déjà pris + déjà proposés dans cet appel
  const resultats: Resultat[] = [];

  for (const f of fichiers) {
    const m = await fetch(`${API}/files/${f.id}?fields=id,name,mimeType,size,parents,modifiedTime`, { headers: h });
    if (!m.ok) { resultats.push({ id: f.id, ancien: f.nom ?? '', nouveau: f.nom ?? '', type: null, tiers: null, date: null, reference: null, partie: null, deja_conforme: false, lu_via: 'nom', raison: 'fichier introuvable' }); continue; }
    const meta = await m.json() as { name: string; mimeType: string; size?: string; parents?: string[]; modifiedTime?: string };
    const ancien = meta.name;
    const base = { id: f.id, ancien, type: null as string | null, tiers: null as string | null, date: null as string | null, reference: null as string | null, partie: null as string | null };
    if (meta.mimeType === DOSSIER_MIME) { resultats.push({ ...base, nouveau: ancien, deja_conforme: false, lu_via: 'nom', raison: 'dossier' }); continue; }

    const parent = meta.parents?.[0] ?? '';
    const chemin = parent ? await cheminDe(parent) : [];
    const voisins = parent ? await nomsDuDossier(parent) : new Set<string>();
    const dejaPris = pris.get(parent) ?? new Set<string>([...reserves.map(x => x.toLowerCase())]);
    pris.set(parent, dejaPris);
    const prisIci = new Set<string>([...voisins, ...dejaPris]);
    prisIci.delete(ancien.toLowerCase());

    if (estNomConforme(ancien)) {
      dejaPris.add(ancien.toLowerCase());
      resultats.push({ ...base, nouveau: ancien, deja_conforme: true, lu_via: 'nom' });
      continue;
    }

    const dateDepot = String(meta.modifiedTime ?? '').slice(0, 10) || jourParis;
    const partie = partieDuTexte(ancien);
    const org = origineDuDossier(chemin);
    const sensible = typeSensibleDuNom(ancien);
    const confidentiel = dossierConfidentiel(chemin);
    const octetsMax = Number(meta.size ?? 0) > MAX_OCTETS;
    const lisible = meta.mimeType === 'application/pdf' || meta.mimeType.startsWith('image/');
    const sansIA = sensible || confidentiel || !lisible || octetsMax || !apiKey;

    let type: string | null = null;
    let tiers: string | null = null;
    let date: string | null = null;
    let reference: string | null = null;
    let luVia: 'image' | 'texte' | 'nom' = 'nom';
    let raison: string | undefined;

    if (sansIA) {
      // Nom + dossier seulement : le type d'une pièce sensible vient de son nom, le salarié du dossier ou du nom.
      type = sensible;
      const salarie = org.salarie ?? salarieDuNom(ancien, salaries);
      if (type && TYPES_SALARIE.has(type)) tiers = salarie;
      raison = confidentiel ? 'Lecture IA désactivée dans ce dossier : ' : sensible ? 'Pièce sensible, non lue par l\'IA : ' : !lisible ? 'Format non lu par l\'IA : ' : octetsMax ? 'Fichier trop lourd (15 Mo) : ' : 'Lecture IA indisponible : ';
      raison += type ? 'nom proposé d\'après le nom du fichier.' : 'décris-le avec « Dis-moi ce que c\'est ».';
    } else {
      const dl = await fetch(`${API}/files/${f.id}?alt=media`, { headers: h });
      const octets = dl.ok ? new Uint8Array(await dl.arrayBuffer()) : null;
      if (!octets) { resultats.push({ ...base, nouveau: ancien, deja_conforme: false, lu_via: 'nom', raison: 'lecture du fichier impossible' }); continue; }
      const contexte = [`Nom du fichier : ${ancien}`, chemin.length ? `Dossier du Drive : ${chemin.join(' / ')}` : null].filter(Boolean).join('\n');
      const lu = await lireDocumentIA(apiKey, systeme, contexte, octets, meta.mimeType);
      if (!lu.ok) { resultats.push({ ...base, nouveau: ancien, deja_conforme: false, lu_via: 'nom', raison: lu.raison }); continue; }
      luVia = lu.luVia;
      const p = normaliserProposition(lu.brut, jourParis);
      const tiersLu = rapprocherTiers(p.tiers, connus);
      const vehiculeLu = rapprocherVehicule(typeof lu.brut?.vehicule === 'string' ? lu.brut.vehicule : null, plaques) ?? org.vehicule;
      type = p.type ?? typeHabituel(historique, tiersLu.nom);
      // Le dossier d'origine complète les cases vides (Clients/<CLIENT> → client ; Fournisseurs/<F> ; salarié ; véhicule) et corrige un tiers douteux.
      const doute = !tiersLu.nom || p.confiance.tiers < 0.7;
      const comp = completerDepuisOrigine({ type, tiers: doute ? null : tiersLu.nom, vehicule: vehiculeLu }, { ...SANS_ORIGINE, client: org.client, salarie: org.salarie, vehicule: org.vehicule });
      tiers = comp.tiers ?? tiersLu.nom;
      if (doute && !comp.tiers && type && (type === 'facture_fournisseur' || type === 'ticket') && org.fournisseur) tiers = org.fournisseur;
      if (!tiers && type && TYPES_CLIENT.has(type) && org.client) tiers = org.client;
      date = p.date;
      reference = p.reference;
    }

    if (!type) {
      resultats.push({ ...base, tiers, date, reference, partie, nouveau: ancien, deja_conforme: false, lu_via: luVia, raison: raison ?? 'Type de document non reconnu : décris-le avec « Dis-moi ce que c\'est ».' });
      continue;
    }
    const nouveau = nomPropose({ date, dateDepot: typeDe(type)?.intemporel ? null : dateDepot, type, tiers, reference, partie }, ancien, prisIci);
    dejaPris.add(nouveau.toLowerCase());
    resultats.push({ ...base, type, tiers, date, reference, partie, nouveau, deja_conforme: nouveau === ancien, lu_via: luVia, raison });
  }

  return jsonResponse({ ok: true, data: { resultats } });
});
