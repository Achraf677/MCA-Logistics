// Edge `drive-connect` — reçoit le provider_refresh_token Google capté au login Drive,
// le VALIDE (en obtenant un access_token), puis le stocke dans google_drive_tokens pour
// la société du user. Token jamais loggué. verify_jwt = true. company_id dérivé du JWT.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return jsonResponse({ ok: false, error: 'missing Authorization' }, 401);

  let refreshToken = '';
  let email: string | null = null;
  try {
    const body = await req.json();
    refreshToken = typeof body?.refresh_token === 'string' ? body.refresh_token : '';
    email = typeof body?.email === 'string' ? body.email : null;
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400);
  }
  if (!refreshToken) return jsonResponse({ ok: false, error: 'refresh_token requis' }, 400);

  // Identité : company_id dérivé du JWT (jamais du body)
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return jsonResponse({ ok: false, error: 'invalid session' }, 401);

  const service = getServiceClient();
  const { data: profile, error: profErr } = await service
    .from('profiles').select('company_id').eq('id', user.id).single();
  if (profErr || !profile?.company_id) {
    return jsonResponse({ ok: false, error: 'profil/société introuvable' }, 400);
  }

  // Valide le refresh_token en obtenant un access_token (qu'on ne stocke pas)
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return jsonResponse({ ok: false, error: 'missing GOOGLE_OAUTH secrets' }, 500);
  }
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!tokenResp.ok) {
    return jsonResponse({ ok: false, error: 'refresh_token Google invalide ou expiré' }, 400);
  }
  await tokenResp.json().catch(() => null); // on ne logge ni ne stocke l'access_token

  const { error: upErr } = await service
    .from('google_drive_tokens')
    .upsert({
      company_id: profile.company_id,
      refresh_token: refreshToken,
      connected_email: email,
      scope: 'https://www.googleapis.com/auth/drive.file',
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' });
  if (upErr) return jsonResponse({ ok: false, error: 'stockage du token échoué' }, 500);

  return jsonResponse({ ok: true, email });
});
