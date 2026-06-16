// Edge `drive-move` — déplace un fichier OU un dossier vers un autre dossier. verify_jwt=true.
// body { file_id, target_folder_id }. Récupère les parents actuels et les remplace par la cible.
// ACCÈS RÉSERVÉ : président OU compte avec drive_access=true.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

async function getAccessToken(refreshToken: string): Promise<string> {
  const form = new URLSearchParams({
    client_id: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!,
    client_secret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!r.ok) throw new Error('refresh_failed');
  const j = await r.json();
  if (!j.access_token) throw new Error('no_access_token');
  return j.access_token as string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ ok: false, error: 'missing Authorization' }, 401);

  let fileId = '';
  let targetFolderId = '';
  try {
    const b = await req.json();
    fileId = typeof b?.file_id === 'string' ? b.file_id : '';
    targetFolderId = typeof b?.target_folder_id === 'string' ? b.target_folder_id : '';
  } catch { /* champs vérifiés ci-dessous */ }
  if (!fileId) return json({ ok: false, error: 'file_id requis' }, 400);
  if (!targetFolderId) return json({ ok: false, error: 'target_folder_id requis' }, 400);
  if (fileId === targetFolderId) return json({ ok: false, error: 'cannot_move_into_self' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return json({ ok: false, error: 'invalid session' }, 401);

  const service = createClient(url, svcKey, { auth: { persistSession: false } });
  const { data: profile } = await service
    .from('profiles').select('company_id, role, drive_access').eq('id', user.id).single();
  if (!profile?.company_id) return json({ ok: false, error: 'société introuvable' }, 400);
  // Garde d'accès Drive : président toujours OK, sinon drive_access requis.
  if (profile.role !== 'president' && profile.drive_access !== true) {
    return json({ ok: false, error: 'drive_access_denied' }, 403);
  }

  const { data: tok } = await service
    .from('google_drive_tokens').select('refresh_token')
    .eq('company_id', profile.company_id).maybeSingle();
  if (!tok?.refresh_token) return json({ ok: false, error: 'drive_not_connected' }, 400);

  let accessToken: string;
  try { accessToken = await getAccessToken(tok.refresh_token); }
  catch { return json({ ok: false, error: 'token_refresh_failed' }, 502); }

  // Parents actuels
  const cr = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!cr.ok) return json({ ok: false, error: 'file_not_found' }, 404);
  const cj = await cr.json();
  const currentParents: string[] = cj.parents ?? [];
  const removeParents = currentParents.join(',');

  // Déplacement : addParents = cible, removeParents = parents actuels
  const params = new URLSearchParams({ addParents: targetFolderId, fields: 'id,parents' });
  if (removeParents) params.set('removeParents', removeParents);
  const mr = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!mr.ok) return json({ ok: false, error: 'move_failed', detail: (await mr.text()).slice(0, 200) }, 502);

  return json({ ok: true, file_id: fileId, target_folder_id: targetFolderId });
});
