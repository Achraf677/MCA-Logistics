// Edge `drive-upload` — envoie un fichier dans le Google Drive de la société (étape 1b).
// verify_jwt=true. Récupère le refresh_token, obtient un access_token frais, crée le dossier
// racine "MCA Documents" si besoin (root_folder_id), upload (multipart/related). → { file_id, name, web_link }.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ROOT_FOLDER_NAME = 'MCA Documents';

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
    .from('profiles').select('company_id').eq('id', user.id).single();
  if (!profile?.company_id) return json({ ok: false, error: 'société introuvable' }, 400);
  const companyId = profile.company_id;

  const { data: tok } = await service
    .from('google_drive_tokens').select('refresh_token, root_folder_id')
    .eq('company_id', companyId).maybeSingle();
  if (!tok?.refresh_token) return json({ ok: false, error: 'drive_not_connected' }, 400);

  let file: File | null = null;
  try {
    const fd = await req.formData();
    const f = fd.get('file');
    if (f instanceof File) file = f;
  } catch { /* pas de form-data */ }
  if (!file) return json({ ok: false, error: 'no_file' }, 400);

  let accessToken: string;
  try { accessToken = await getAccessToken(tok.refresh_token); }
  catch { return json({ ok: false, error: 'token_refresh_failed' }, 502); }

  let folderId = tok.root_folder_id as string | null;
  if (!folderId) {
    const fr = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: ROOT_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    if (!fr.ok) return json({ ok: false, error: 'folder_create_failed', detail: (await fr.text()).slice(0, 200) }, 502);
    folderId = (await fr.json()).id;
    await service.from('google_drive_tokens')
      .update({ root_folder_id: folderId, updated_at: new Date().toISOString() })
      .eq('company_id', companyId);
  }

  const boundary = '----mca' + crypto.randomUUID().replace(/-/g, '');
  const metadata = JSON.stringify({ name: file.name, parents: [folderId] });
  const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`;
  const post = `\r\n--${boundary}--`;
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const body = new Blob([pre, fileBytes, post]);

  const up = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!up.ok) return json({ ok: false, error: 'upload_failed', detail: (await up.text()).slice(0, 200) }, 502);
  const uj = await up.json();

  return json({ ok: true, file_id: uj.id, name: uj.name, web_link: uj.webViewLink });
});
