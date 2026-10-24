// Edge `drive-ranger` — range des documents CONFIRMÉS dans le Drive : <racine>/<chemin…>/<nom>, puis les marque « classés ».
// POST { items: [{ id, nom, chemin: string[] (4 niveaux au plus), meta?: { type, date, tiers, reference, montant_ttc_cts, resume } }] } (12 au plus)
//   → { ok, data: { resultats: [{ id, ok, raison?, drive_file_id? }] } }
// Les dossiers sont résolus UNE fois chacun (pas de doublon), puis les envois partent en parallèle (4 à la fois).
// Écrit `documents` : drive_file_id / drive_url, file_name, métadonnées, statut_tri = 'classe'. Droit : Drive (président / drive_access) ET systeme.documents / update.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { verifierDroitCompte } from '../_shared/auth.ts';
import { accesDrive, dossierDans, racineRangement, televerser } from '../_shared/googleDrive.ts';

const MAX_ITEMS = 12;
const PARALLELE = 4;

const propre = (s: unknown, repli: string) => (typeof s === 'string' ? s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim().slice(0, 120) : '') || repli;

interface Item { id: string; nom: string; chemin: string[]; meta: Record<string, unknown> }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  let brut: Record<string, unknown> = {};
  try { brut = await req.json(); } catch { return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400); }
  const liste = (Array.isArray(brut.items) ? brut.items : [brut]).slice(0, MAX_ITEMS) as Array<Record<string, unknown>>;
  const items: Item[] = liste.filter(i => typeof i?.id === 'string').map(i => ({
    id: String(i.id),
    nom: propre(i.nom, ''),
    chemin: (Array.isArray(i.chemin) ? i.chemin : []).map(x => propre(x, '')).filter(Boolean).slice(0, 4),
    meta: (i.meta && typeof i.meta === 'object' ? i.meta : {}) as Record<string, unknown>,
  }));
  if (items.length === 0) return jsonResponse({ ok: false, error: 'id requis' }, 400);

  const service = getServiceClient();
  const a = await accesDrive(req, service);
  if (!a.ok) return a.response;
  const droit = await verifierDroitCompte(service, a.userId, 'systeme.documents', 'update');
  if (!droit.ok) return droit.response;

  const { data: docs } = await service.from('documents').select('id, company_id, storage_path, mime_type, file_name').in('id', items.map(i => i.id));
  const parId = new Map((docs ?? []).filter(d => d.company_id === a.companyId).map(d => [String(d.id), d]));

  let racine: string;
  const dossiers = new Map<string, string>();
  try {
    racine = await racineRangement(a);
    // Chaque chemin est résolu une seule fois, dans l'ordre : deux documents du même dossier ne le créent pas deux fois.
    for (const it of items) {
      const segments = it.chemin.length ? it.chemin : ['Autre'];
      let parent = racine;
      for (let n = 1; n <= segments.length; n++) {
        const cle = segments.slice(0, n).join('\u0001');
        if (!dossiers.has(cle)) dossiers.set(cle, await dossierDans(a.token, parent, segments[n - 1]));
        parent = dossiers.get(cle)!;
      }
    }
  } catch (e) {
    console.error('drive-ranger dossiers', (e as Error)?.message);
    return jsonResponse({ ok: false, error: 'dossiers du Drive impossibles à préparer' }, 502);
  }

  const resultats: Array<{ id: string; ok: boolean; raison?: string; drive_file_id?: string }> = [];
  const un = async (it: Item) => {
    const doc = parId.get(it.id);
    if (!doc) { resultats.push({ id: it.id, ok: false, raison: 'document introuvable' }); return; }
    if (!doc.storage_path) { resultats.push({ id: it.id, ok: false, raison: 'fichier absent du stockage' }); return; }
    try {
      const { data: blob } = await service.storage.from('documents').download(doc.storage_path);
      if (!blob) { resultats.push({ id: it.id, ok: false, raison: 'fichier introuvable dans le stockage' }); return; }
      const dest = dossiers.get((it.chemin.length ? it.chemin : ['Autre']).join('\u0001'))!;
      const nom = it.nom || String(doc.file_name);
      const f = await televerser(a.token, dest, nom, String(doc.mime_type ?? ''), new Uint8Array(await blob.arrayBuffer()));
      const m = it.meta;
      const { error } = await service.from('documents').update({
        drive_file_id: f.id, drive_url: f.lien, file_name: nom, statut_tri: 'classe', proposition: null, trie_le: new Date().toISOString(),
        type_document: typeof m.type === 'string' ? m.type : null, date_document: typeof m.date === 'string' ? m.date : null,
        tiers: typeof m.tiers === 'string' ? m.tiers : null, reference: typeof m.reference === 'string' ? m.reference : null,
        montant_ttc_cts: typeof m.montant_ttc_cts === 'number' ? m.montant_ttc_cts : null, resume: typeof m.resume === 'string' ? m.resume : null,
      }).eq('id', doc.id);
      resultats.push(error ? { id: it.id, ok: false, raison: 'enregistrement impossible' } : { id: it.id, ok: true, drive_file_id: f.id });
    } catch (e) {
      console.error('drive-ranger', it.id, (e as Error)?.message);
      resultats.push({ id: it.id, ok: false, raison: 'envoi vers le Drive impossible' });
    }
  };
  const file = [...items];
  await Promise.all(Array.from({ length: Math.min(PARALLELE, file.length) }, async () => { for (let it = file.shift(); it; it = file.shift()) await un(it); }));

  return jsonResponse({ ok: true, data: { resultats } });
});
