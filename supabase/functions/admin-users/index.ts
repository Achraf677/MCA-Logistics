// Edge `admin-users` — création et gestion des comptes. verify_jwt=true. RÉSERVÉ PRÉSIDENT.
// Garde anti-lockout : aucune action destructrice sur soi-même ; 'president' non assignable via l'UI.
//  - create  { email, password, full_name, role? }  (role par défaut 'admin')
//  - invite  { email, full_name, role? }
//  - set_role { user_id, role }   (role ∈ admin/dg/chauffeur/comptable)
//  - set_active { user_id, active } ; delete { user_id }
//  - set_password { user_id, password }  (l'admin definit le mot de passe)
//  - send_reset { user_id }              (lien de reinitialisation par e-mail)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Rôles assignables via l'interface (PAS 'president' : non créable/assignable ici).
const ASSIGNABLE_ROLES = ['admin', 'dg', 'chauffeur', 'comptable'];
const pickRole = (v: unknown) => (typeof v === 'string' && ASSIGNABLE_ROLES.includes(v) ? v : 'admin');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ ok: false, error: 'missing Authorization' }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* défaut */ }
  const action = typeof body.action === 'string' ? body.action : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
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

  // ---- CRÉER ----
  if (action === 'create') {
    if (!email || !password || !fullName) return json({ ok: false, error: 'email, password, full_name requis' }, 400);
    if (password.length < 8) return json({ ok: false, error: 'mot de passe trop court (min 8)' }, 400);
    const role = pickRole(body.role);
    const { data: created, error: cErr } = await service.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (cErr || !created?.user) return json({ ok: false, error: 'create_failed', detail: cErr?.message ?? '' }, 400);
    const newId = created.user.id;
    const { error: pErr } = await service.from('profiles').insert({
      id: newId, company_id: companyId, full_name: fullName, role, email, active: true,
    });
    if (pErr) {
      await service.auth.admin.deleteUser(newId);
      return json({ ok: false, error: 'profile_failed', detail: pErr.message }, 500);
    }
    return json({ ok: true, user_id: newId, role, mode: 'created' });
  }

  // ---- INVITER ----
  if (action === 'invite') {
    if (!email || !fullName) return json({ ok: false, error: 'email, full_name requis' }, 400);
    const role = pickRole(body.role);
    const { data: invited, error: iErr } = await service.auth.admin.inviteUserByEmail(email);
    if (iErr || !invited?.user) {
      return json({ ok: false, error: 'invite_failed', detail: iErr?.message ?? 'SMTP non configuré ?' }, 400);
    }
    const newId = invited.user.id;
    const { error: pErr } = await service.from('profiles').upsert({
      id: newId, company_id: companyId, full_name: fullName, role, email, active: true,
    }, { onConflict: 'id' });
    if (pErr) return json({ ok: false, error: 'profile_failed', detail: pErr.message }, 500);
    return json({ ok: true, user_id: newId, role, mode: 'invited' });
  }

  // Actions ciblant un compte existant.
  if (!targetUserId) return json({ ok: false, error: 'user_id requis' }, 400);
  if (targetUserId === user.id) return json({ ok: false, error: 'action_interdite_sur_soi_meme' }, 400);
  const { data: target } = await service
    .from('profiles').select('id, role, company_id').eq('id', targetUserId).single();
  if (!target || target.company_id !== companyId) return json({ ok: false, error: 'cible_introuvable' }, 404);

  // ---- CHANGER LE RÔLE (jamais 'president') ----
  if (action === 'set_role') {
    const role = typeof body.role === 'string' ? body.role : '';
    if (!ASSIGNABLE_ROLES.includes(role)) return json({ ok: false, error: 'role_invalide' }, 400);
    if (target.role === 'president') return json({ ok: false, error: 'president_non_modifiable' }, 400);
    const { error } = await service.from('profiles').update({ role }).eq('id', targetUserId);
    if (error) return json({ ok: false, error: 'set_role_failed' }, 500);
    return json({ ok: true, role });
  }

  // ---- ACTIVER / DÉSACTIVER ----
  if (action === 'set_active') {
    const active = body.active === true;
    const { error } = await service.from('profiles').update({ active }).eq('id', targetUserId);
    if (error) return json({ ok: false, error: 'set_active_failed' }, 500);
    return json({ ok: true, active });
  }

  // ---- RÉINITIALISER LE MOT DE PASSE ----
  // Deux chemins, parce qu'ils répondent à deux situations différentes :
  //   - `set_password` : le salarié est devant vous et a oublié son mot de
  //     passe. Immédiat, et surtout indépendant de l'envoi d'e-mails — la
  //     branche `invite` ci-dessus montre que le SMTP peut ne pas être
  //     configuré. C'est le chemin qui marche toujours.
  //   - `send_reset` : le salarié est à distance. Personne, pas même le
  //     président, ne connaît alors son mot de passe.
  // Dans les deux cas, jamais sur un compte président : ce serait une prise de
  // contrôle d'un compte de même niveau, pas une assistance.
  if (action === 'set_password') {
    if (target.role === 'president') return json({ ok: false, error: 'president_non_modifiable' }, 400);
    if (!password) return json({ ok: false, error: 'password requis' }, 400);
    if (password.length < 8) return json({ ok: false, error: 'mot de passe trop court (min 8)' }, 400);
    const { error } = await service.auth.admin.updateUserById(targetUserId, { password });
    if (error) return json({ ok: false, error: 'set_password_failed', detail: error.message }, 500);
    return json({ ok: true, mode: 'defini' });
  }

  if (action === 'send_reset') {
    if (target.role === 'president') return json({ ok: false, error: 'president_non_modifiable' }, 400);
    const { data: cible } = await service
      .from('profiles').select('email').eq('id', targetUserId).single();
    const cibleEmail = typeof cible?.email === 'string' ? cible.email : '';
    if (!cibleEmail) return json({ ok: false, error: 'email_cible_inconnu' }, 400);
    // Client anon : `resetPasswordForEmail` est une méthode publique, pas admin.
    const { error } = await userClient.auth.resetPasswordForEmail(cibleEmail);
    if (error) {
      return json({
        ok: false, error: 'send_reset_failed',
        detail: error.message,
        message: "L'e-mail n'a pas pu être envoyé (SMTP non configuré ?). Définis un mot de passe à la place.",
      }, 400);
    }
    return json({ ok: true, mode: 'email_envoye', email: cibleEmail });
  }

  // ---- SUPPRIMER ----
  if (action === 'delete') {
    if (target.role === 'president') return json({ ok: false, error: 'suppression_president_interdite' }, 400);
    await service.from('profiles').delete().eq('id', targetUserId);
    const { error } = await service.auth.admin.deleteUser(targetUserId);
    if (error) return json({ ok: false, error: 'delete_failed', detail: error.message }, 500);
    return json({ ok: true });
  }

  return json({ ok: false, error: 'action_inconnue' }, 400);
});
