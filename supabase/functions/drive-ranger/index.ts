// Edge `drive-ranger` — range un document CONFIRMÉ dans le Drive : <racine>/<chemin…>/<nom>.
// POST { id, nom, chemin: string[] (4 niveaux au plus) }  (ancien format { dossier, annee } toujours accepté) → { ok, data: { drive_file_id, drive_url } }
// Lit le fichier dans Storage `documents`, le téléverse dans le Drive, note `documents.drive_file_id / drive_url`.
// La Bibliothèque lit le Drive : un document sans Drive reste dans l'Inbox / À confirmer.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { accesDrive, dossierDans, racineRangement, televerser } from '../_shared/googleDrive.ts';

const propre = (s: unknown, repli: string) => (typeof s === 'string' ? s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim().slice(0, 120) : '') || repli;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400); }
  const id = typeof b.id === 'string' ? b.id : '';
  if (!id) return jsonResponse({ ok: false, error: 'id requis' }, 400);

  const service = getServiceClient();
  const a = await accesDrive(req, service);
  if (!a.ok) return a.response;

  const { data: doc } = await service.from('documents').select('id, company_id, storage_path, mime_type, file_name').eq('id', id).maybeSingle();
  if (!doc || doc.company_id !== a.companyId) return jsonResponse({ ok: false, error: 'document introuvable' }, 404);
  if (!doc.storage_path) return jsonResponse({ ok: false, error: 'fichier absent du stockage' }, 400);

  const { data: blob } = await service.storage.from('documents').download(doc.storage_path);
  if (!blob) return jsonResponse({ ok: false, error: 'fichier introuvable dans le stockage' }, 404);

  try {
    const racine = await racineRangement(a);
    const segments = (Array.isArray(b.chemin) ? b.chemin : [b.dossier, /^\d{4}$/.test(String(b.annee ?? '')) ? String(b.annee) : 'Sans date'])
      .map(x => propre(x, '')).filter(Boolean).slice(0, 4);
    let dest = racine;
    for (const seg of segments.length ? segments : ['Autre']) dest = await dossierDans(a.token, dest, seg);
    const nom = propre(b.nom, String(doc.file_name));
    const fichier = await televerser(a.token, dest, nom, String(doc.mime_type ?? ''), new Uint8Array(await blob.arrayBuffer()));
    await service.from('documents').update({ drive_file_id: fichier.id, drive_url: fichier.lien }).eq('id', doc.id);
    return jsonResponse({ ok: true, data: { drive_file_id: fichier.id, drive_url: fichier.lien } });
  } catch (e) {
    console.error('drive-ranger', (e as Error)?.message);
    return jsonResponse({ ok: false, error: 'envoi vers le Drive impossible' }, 502);
  }
});
