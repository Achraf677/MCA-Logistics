// Edge `drive-browse` — explore le Drive de la société (Bibliothèque de l'onglet Documents).
// POST { folder_id? ('root' par défaut), recherche?, definir_racine? }
//  - dossier : sépare dossiers et fichiers (triés) ; recherche : nom contenant le texte, dans tout le Drive ;
//  - definir_racine + folder_id : ce dossier devient le dossier de rangement (`google_drive_tokens.root_folder_id`), président seulement.
// Réponse : { ok, folder_id, racine_id, folders, files }
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { accesDrive, DOSSIER_MIME } from '../_shared/googleDrive.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  let folderId = 'root';
  let recherche = '';
  let definirRacine = false;
  try {
    const b = await req.json();
    if (typeof b?.folder_id === 'string' && /^[\w-]{1,}$/.test(b.folder_id)) folderId = b.folder_id;
    if (typeof b?.recherche === 'string') recherche = b.recherche.trim().slice(0, 80);
    definirRacine = b?.definir_racine === true;
  } catch { /* défaut : racine du Drive */ }

  const service = getServiceClient();
  const a = await accesDrive(req, service);
  if (!a.ok) return a.response;

  let racineId = a.racineId;
  if (definirRacine) {
    const { data: p } = await service.from('profiles').select('role').eq('id', a.userId).maybeSingle();
    if (p?.role !== 'president') return jsonResponse({ ok: false, error: 'forbidden_president_only' }, 403);
    if (folderId === 'root') return jsonResponse({ ok: false, error: 'choisis un dossier précis' }, 400);
    await service.from('google_drive_tokens').update({ root_folder_id: folderId, updated_at: new Date().toISOString() }).eq('company_id', a.companyId);
    racineId = folderId;
  }

  const filtre = recherche
    ? `name contains '${recherche.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and trashed=false`
    : `'${folderId}' in parents and trashed=false`;
  const fields = encodeURIComponent('files(id,name,mimeType,webViewLink,iconLink,modifiedTime,size,parents)');
  const tri = recherche ? 'modifiedTime%20desc' : 'folder,name';
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(filtre)}&fields=${fields}&orderBy=${tri}&pageSize=${recherche ? 100 : 1000}`,
    { headers: { Authorization: `Bearer ${a.token}` } },
  );
  if (!r.ok) return jsonResponse({ ok: false, error: 'browse_failed', detail: (await r.text()).slice(0, 200) }, 502);
  const tous = ((await r.json()).files ?? []) as Array<{ mimeType: string }>;
  return jsonResponse({
    ok: true, folder_id: folderId, racine_id: racineId,
    folders: tous.filter(f => f.mimeType === DOSSIER_MIME),
    files: tous.filter(f => f.mimeType !== DOSSIER_MIME),
  });
});
