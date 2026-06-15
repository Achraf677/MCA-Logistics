// Edge `drive-status` — indique si la société a un Drive connecté, SANS jamais renvoyer
// le refresh_token. verify_jwt = true. company_id dérivé du JWT.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return jsonResponse({ ok: false, error: 'missing Authorization' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return jsonResponse({ ok: false, error: 'invalid session' }, 401);

  const service = getServiceClient();
  const { data: profile } = await service
    .from('profiles').select('company_id').eq('id', user.id).single();
  if (!profile?.company_id) return jsonResponse({ ok: false, error: 'société introuvable' }, 400);

  const { data: tok } = await service
    .from('google_drive_tokens')
    .select('connected_email, root_folder_id, connected_at')
    .eq('company_id', profile.company_id)
    .maybeSingle();

  return jsonResponse({
    ok: true,
    connected: !!tok,
    email: tok?.connected_email ?? null,
    root_folder_id: tok?.root_folder_id ?? null,
    connected_at: tok?.connected_at ?? null,
  });
});
