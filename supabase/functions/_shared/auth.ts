// Contrôle d'accès commun aux Edge Functions qui travaillent en service role.
//
// Le service role contourne la RLS : chaque fonction doit donc revérifier
// elle-même QUI appelle (JWT), sa société et ses droits — sinon n'importe quel
// compte connecté (chauffeur compris) peut déclencher l'action.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type PermAction = 'view' | 'create' | 'update' | 'delete';

export interface Appelant {
  userId: string;
  companyId: string;
  role: string | null;
  /** Client service role (à n'utiliser qu'APRÈS les contrôles). */
  service: SupabaseClient;
}

export class AuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * Lit le JWT de l'appelant, vérifie la session et charge sa société + son rôle.
 * Lève AuthError (401 / 403) sinon.
 */
export async function lireAppelant(req: Request): Promise<Appelant> {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !svcKey) throw new AuthError('server misconfiguration', 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) throw new AuthError('missing Authorization', 401);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) throw new AuthError('invalid session', 401);

  const service = createClient(url, svcKey, { auth: { persistSession: false } });
  const { data: me } = await service
    .from('profiles').select('company_id, role').eq('id', user.id).single();
  if (!me?.company_id) throw new AuthError('société introuvable', 403);

  return { userId: user.id, companyId: me.company_id as string, role: (me.role as string) ?? null, service };
}

/**
 * Même règle que `public.is_president() or public.has_permission(res, action)`
 * côté RLS : le président a tout, les autres selon `user_permissions`.
 */
export async function aLaPermission(
  a: Appelant,
  resource: string,
  action: PermAction,
): Promise<boolean> {
  if (a.role === 'president') return true;
  const col = { view: 'can_view', create: 'can_create', update: 'can_update', delete: 'can_delete' }[action];
  const { data, error } = await a.service
    .from('user_permissions')
    .select(col)
    .eq('user_id', a.userId)
    .eq('resource_key', resource)
    .maybeSingle();
  if (error || !data) return false;
  return (data as Record<string, unknown>)[col] === true;
}
