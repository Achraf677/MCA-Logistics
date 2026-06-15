// Edge `drive-oauth-callback` — reçoit le code de Google, l'échange côté serveur contre
// un refresh token, et le stocke pour la société. verify_jwt=FALSE : c'est Google qui appelle
// (sans JWT). Sécurité : le `state` est un nonce à usage unique en base + le `code` Google
// est à usage unique et lié à notre client. Aucun token n'est jamais loggué.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const REDIRECT_URI = 'https://pzfgtcugmqeqixogwzcu.supabase.co/functions/v1/drive-oauth-callback';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FALLBACK_ORIGIN = 'http://localhost:5173';

function redirectTo(origin: string, params: Record<string, string>): Response {
  const u = new URL('/systeme', origin);
  u.searchParams.set('tab', 'parametres');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}

Deno.serve(async (req: Request) => {
  const reqUrl = new URL(req.url);
  const code = reqUrl.searchParams.get('code');
  const state = reqUrl.searchParams.get('state');
  const oauthErr = reqUrl.searchParams.get('error');

  const url = Deno.env.get('SUPABASE_URL')!;
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const service = createClient(url, svcKey, { auth: { persistSession: false } });

  let origin = '';
  let companyId = '';
  let expired = false;
  if (state) {
    const { data: st } = await service
      .from('google_drive_oauth_states').select('*').eq('state', state).maybeSingle();
    if (st) {
      origin = st.redirect_origin ?? '';
      companyId = st.company_id;
      expired = new Date(st.expires_at).getTime() < Date.now();
    }
  }
  const safeOrigin = origin || FALLBACK_ORIGIN;

  const cleanup = async () => { if (state) await service.from('google_drive_oauth_states').delete().eq('state', state); };

  if (oauthErr) { await cleanup(); return redirectTo(safeOrigin, { drive: 'error', reason: oauthErr }); }
  if (expired) { await cleanup(); return redirectTo(safeOrigin, { drive: 'error', reason: 'expired' }); }
  if (!code || !state || !companyId) return redirectTo(safeOrigin, { drive: 'error', reason: 'missing_code_or_state' });

  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
  if (!clientId || !clientSecret) { await cleanup(); return redirectTo(safeOrigin, { drive: 'error', reason: 'missing_secrets' }); }

  const form = new URLSearchParams({
    client_id: clientId, client_secret: clientSecret, code,
    redirect_uri: REDIRECT_URI, grant_type: 'authorization_code',
  });
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!resp.ok) { await cleanup(); return redirectTo(safeOrigin, { drive: 'error', reason: 'token_exchange_failed' }); }
  const tok = await resp.json();
  const refreshToken = tok?.refresh_token;
  if (!refreshToken) { await cleanup(); return redirectTo(safeOrigin, { drive: 'error', reason: 'no_refresh_token' }); }

  let email: string | null = null;
  try {
    if (tok.id_token) {
      const payload = JSON.parse(atob(tok.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      email = payload.email ?? null;
    }
  } catch { /* email optionnel */ }

  const { error: upErr } = await service.from('google_drive_tokens').upsert({
    company_id: companyId,
    refresh_token: refreshToken,
    connected_email: email,
    scope: 'https://www.googleapis.com/auth/drive',
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id' });
  await cleanup();
  if (upErr) return redirectTo(safeOrigin, { drive: 'error', reason: 'store_failed' });

  return redirectTo(safeOrigin, { drive: 'connected' });
});
