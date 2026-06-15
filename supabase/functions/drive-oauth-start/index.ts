// Edge `drive-oauth-start` — démarre le flux OAuth Drive côté serveur (Plan B).
// Authentifie le user (verify_jwt=true), crée un state (nonce) lié à sa société,
// et renvoie l'URL d'autorisation Google (scope drive complet, access_type=offline).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const REDIRECT_URI = 'https://pzfgtcugmqeqixogwzcu.supabase.co/functions/v1/drive-oauth-callback';
const SCOPE = 'https://www.googleapis.com/auth/drive';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ ok: false, error: 'missing Authorization' }, 401);

  let origin = '';
  try {
    const b = await req.json();
    origin = typeof b?.origin === 'string' ? b.origin : '';
  } catch { /* origin requis ci-dessous */ }
  if (!origin) return json({ ok: false, error: 'origin requis' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return json({ ok: false, error: 'invalid session' }, 401);

  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const service = createClient(url, svcKey, { auth: { persistSession: false } });
  const { data: profile } = await service
    .from('profiles').select('company_id').eq('id', user.id).single();
  if (!profile?.company_id) return json({ ok: false, error: 'société introuvable' }, 400);

  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
  if (!clientId) return json({ ok: false, error: 'missing GOOGLE_OAUTH_CLIENT_ID' }, 500);

  const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
  const { error: insErr } = await service.from('google_drive_oauth_states').insert({
    state, company_id: profile.company_id, user_id: user.id, redirect_origin: origin,
  });
  if (insErr) return json({ ok: false, error: 'state non créé' }, 500);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);
  if (user.email) authUrl.searchParams.set('login_hint', user.email);

  return json({ ok: true, url: authUrl.toString() });
});
