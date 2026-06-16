// Edge `admin-permissions` — gestion des permissions CRUD par compte. verify_jwt=true. RÉSERVÉ PRÉSIDENT.
// BILINGUE : accepte le vocabulaire FR du front (resource/voir/creer/modifier/supprimer)
// ET l'anglais (resource_key/can_view/...). Écrit toujours en colonnes anglaises dans la table.
// get renvoie le format FR attendu par le front.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const asBool = (v: unknown) => v === true;
// Lecture tolérante FR/EN d'une ligne de permission entrante.
function readPerm(p: Record<string, unknown>) {
  const resource =
    typeof p?.resource === 'string' ? p.resource :
    typeof p?.resource_key === 'string' ? p.resource_key : '';
  return {
    resource_key: resource,
    can_view: asBool(p?.voir ?? p?.can_view),
    can_create: asBool(p?.creer ?? p?.can_create),
    can_update: asBool(p?.modifier ?? p?.can_update),
    can_delete: asBool(p?.supprimer ?? p?.can_delete),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ ok: false, error: 'missing Authorization' }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* défaut */ }
  const action = typeof body.action === 'string' ? body.action : 'list_members';
  const targetUserId = typeof body.user_id === 'string' ? body.user_id : '';

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
  if (me.role !== 'president') return json({ ok: false, error: 'forbidden_president_only' }, 403);
  const companyId = me.company_id;

  // ---- LISTE DES MEMBRES (+ email) ----
  if (action === 'list_members') {
    const { data: profs, error } = await service
      .from('profiles').select('id, full_name, role, active')
      .eq('company_id', companyId).order('role', { ascending: true });
    if (error) return json({ ok: false, error: 'list_failed' }, 500);
    const emailById = new Map<string, string>();
    try {
      const { data: list } = await service.auth.admin.listUsers();
      for (const u of list?.users ?? []) if (u.id && u.email) emailById.set(u.id, u.email);
    } catch { /* best-effort */ }
    const members = (profs ?? []).map((p) => ({
      id: p.id, full_name: p.full_name, role: p.role, active: p.active,
      email: emailById.get(p.id) ?? null,
    }));
    return json({ ok: true, members });
  }

  if (!targetUserId) return json({ ok: false, error: 'user_id requis' }, 400);
  const { data: target } = await service
    .from('profiles').select('id, role, company_id').eq('id', targetUserId).single();
  if (!target || target.company_id !== companyId) return json({ ok: false, error: 'cible_introuvable' }, 404);

  // ---- LIRE LES PERMISSIONS (renvoyées au format FR du front) ----
  if (action === 'get') {
    const { data: perms, error } = await service
      .from('user_permissions')
      .select('resource_key, can_view, can_create, can_update, can_delete')
      .eq('user_id', targetUserId);
    if (error) return json({ ok: false, error: 'get_failed' }, 500);
    const permissions = (perms ?? []).map((p) => ({
      resource: p.resource_key,
      voir: p.can_view,
      creer: p.can_create,
      modifier: p.can_update,
      supprimer: p.can_delete,
    }));
    return json({ ok: true, permissions, target_role: target.role });
  }

  if (target.role === 'president') return json({ ok: false, error: 'president_bypasse' }, 400);

  // ---- ÉCRIRE UNE RESSOURCE ----
  if (action === 'set') {
    const r = readPerm(body);
    if (!r.resource_key) return json({ ok: false, error: 'resource requis' }, 400);
    const { error } = await service.from('user_permissions').upsert(
      { user_id: targetUserId, company_id: companyId, ...r, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,resource_key' },
    );
    if (error) return json({ ok: false, error: 'set_failed', detail: error.message }, 500);
    return json({ ok: true });
  }

  // ---- ÉCRIRE TOUTE LA MATRICE ----
  if (action === 'set_bulk') {
    const perms = Array.isArray(body.permissions) ? (body.permissions as Record<string, unknown>[]) : null;
    if (!perms) return json({ ok: false, error: 'permissions requis (array)' }, 400);
    const now = new Date().toISOString();
    const rows = perms
      .filter((p) => p && typeof p === 'object')
      .map((p) => ({ user_id: targetUserId, company_id: companyId, ...readPerm(p), updated_at: now }))
      .filter((r) => r.resource_key);
    if (rows.length === 0) return json({ ok: false, error: 'aucune ligne valide' }, 400);
    const { error } = await service
      .from('user_permissions').upsert(rows, { onConflict: 'user_id,resource_key' });
    if (error) return json({ ok: false, error: 'set_bulk_failed', detail: error.message }, 500);
    return json({ ok: true, count: rows.length });
  }

  return json({ ok: false, error: 'action_inconnue' }, 400);
});
