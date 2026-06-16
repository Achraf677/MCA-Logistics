// Edge `drive-browse` — explore n'importe quel dossier du Drive de la société.
// verify_jwt=true. body { folder_id? } (défaut 'root' = Mon Drive). Sépare dossiers et fichiers.
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
const FOLDER_MIME = 'application/vnd.google-apps.folder';

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

  let folderId = 'root';
  try {
    const b = await req.json();
    if (typeof b?.folder_id === 'string' && b.folder_id) folderId = b.folder_id;
  } catch { /* défaut root */ }

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

  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const fields = encodeURIComponent('files(id,name,mimeType,webViewLink,iconLink,modifiedTime,size)');
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=folder,name&pageSize=1000`;
  const r = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) return json({ ok: false, error: 'browse_failed', detail: (await r.text()).slice(0, 200) }, 502);
  const j = await r.json();
  const all = (j.files ?? []) as Array<{ mimeType: string }>;

  const folders = all.filter((f) => f.mimeType === FOLDER_MIME);
  const files = all.filter((f) => f.mimeType !== FOLDER_MIME);

  return json({ ok: true, folder_id: folderId, folders, files });
});
