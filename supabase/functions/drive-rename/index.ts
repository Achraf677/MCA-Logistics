// Edge `drive-rename` — renomme un fichier OU un dossier du Drive. verify_jwt=true.
// body { file_id, name }.
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
  let name = '';
  try {
    const b = await req.json();
    fileId = typeof b?.file_id === 'string' ? b.file_id : '';
    name = typeof b?.name === 'string' ? b.name.trim() : '';
  } catch { /* champs vérifiés ci-dessous */ }
  if (!fileId) return json({ ok: false, error: 'file_id requis' }, 400);
  if (!name) return json({ ok: false, error: 'name requis' }, 400);

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

  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) return json({ ok: false, error: 'rename_failed', detail: (await r.text()).slice(0, 200) }, 502);
  const j = await r.json();

  return json({ ok: true, id: j.id, name: j.name });
});
