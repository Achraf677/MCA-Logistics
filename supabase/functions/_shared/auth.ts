// Contrôle d'accès des Edge Functions qui travaillent en service_role.
//
// Le service_role CONTOURNE la RLS : sans ce contrôle, n'importe quel compte
// connecté (un chauffeur, un compte d'une autre société) pourrait facturer ou
// déclarer payée n'importe quelle livraison en connaissant son id.
//
// Même règle que la RLS de `deliveries` (migrations 20260616184716 et
// 20260616190932) : même société que le compte, ET président OU permission
// `user_permissions` (resource_key, can_<action>) — c'est ce que font
// `is_president()` et `has_permission()` côté SQL, relus ici explicitement
// parce que `auth.uid()` n'existe pas dans un client service_role.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse } from './cors.ts';

export type ActionPermission = 'view' | 'create' | 'update' | 'delete';

export type ResultatAcces =
  | { ok: true; userId: string; companyId: string; role: string }
  | { ok: false; response: Response };

const COLONNE: Record<ActionPermission, string> = {
  view: 'can_view',
  create: 'can_create',
  update: 'can_update',
  delete: 'can_delete',
};

export async function exigerPermission(
  req: Request,
  service: SupabaseClient,
  resourceKey: string,
  action: ActionPermission,
): Promise<ResultatAcces> {
  const header = req.headers.get('Authorization') ?? '';
  const jwt = header.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Session absente — reconnectez-vous.' }, 401) };
  }

  const { data: userData, error: uErr } = await service.auth.getUser(jwt);
  const user = userData?.user;
  if (uErr || !user) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Session invalide — reconnectez-vous.' }, 401) };
  }

  const { data: profile } = await service
    .from('profiles')
    .select('company_id, role, active')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.company_id) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Société introuvable pour ce compte.' }, 403) };
  }
  if (profile.active === false) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Compte désactivé.' }, 403) };
  }

  const role = String(profile.role ?? '');
  if (role !== 'president') {
    const { data: perms } = await service
      .from('user_permissions')
      .select(COLONNE[action])
      .eq('user_id', user.id)
      .eq('resource_key', resourceKey);
    const autorise = (perms ?? []).some(
      (p) => (p as unknown as Record<string, unknown>)[COLONNE[action]] === true,
    );
    if (!autorise) {
      return {
        ok: false,
        response: jsonResponse(
          { ok: false, error: `Droit insuffisant (${resourceKey} : ${action}).` },
          403,
        ),
      };
    }
  }

  return { ok: true, userId: user.id, companyId: String(profile.company_id), role };
}
