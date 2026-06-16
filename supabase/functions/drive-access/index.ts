// Edge `drive-access` — gestion de l'accès Drive par compte. verify_jwt=true.
// RÉSERVÉ AU PRÉSIDENT. 
//  - body { action: 'list' } → { ok, members: [{id, full_name, role, drive_access}] }
//  - body { action: 'set', user_id, allowed } → { ok, user_id, drive_access }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ ok: false, error: 'missing Authorization' }, 401);

  let action = 'list';
  let targetUserId = '';
  let allowed = false;
  try {
    const b = await req.json();
    if (typeof b?.action === 'string' && b.action) action = b.action;
    if (typeof b?.user_id === 'string') targetUserId = b.user_id;
    allowed = b?.allowed === true;
  } catch { /* défaut list */ }

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
  const { data: me } = await service
    .from('profiles').select('company_id, role').eq('id', user.id).single();
  if (!me?.company_id) return json({ ok: false, error: 'société introuvable' }, 400);
  // SEUL LE PRÉSIDENT gère l'accès Drive.
  if (me.role !== 'president') return json({ ok: false, error: 'forbidden_president_only' }, 403);

  if (action === 'list') {
    const { data: members, error } = await service
      .from('profiles').select('id, full_name, role, drive_access')
      .eq('company_id', me.company_id).order('role', { ascending: true });
    if (error) return json({ ok: false, error: 'list_failed' }, 500);
    return json({ ok: true, members: members ?? [] });
  }

  if (action === 'set') {
    if (!targetUserId) return json({ ok: false, error: 'user_id requis' }, 400);
    // Vérifie que la cible est bien dans la même société.
    const { data: target } = await service
      .from('profiles').select('id, role, company_id').eq('id', targetUserId).single();
    if (!target || target.company_id !== me.company_id) {
      return json({ ok: false, error: 'cible_introuvable' }, 404);
    }
    // Le président a toujours accès via son rôle : inutile (et trompeur) de basculer son flag.
    if (target.role === 'president') {
      return json({ ok: false, error: 'president_toujours_autorise' }, 400);
    }
    const { error } = await service
      .from('profiles').update({ drive_access: allowed }).eq('id', targetUserId);
    if (error) return json({ ok: false, error: 'update_failed' }, 500);
    return json({ ok: true, user_id: targetUserId, drive_access: allowed });
  }

  return json({ ok: false, error: 'action_inconnue' }, 400);
});
