// Edge `admin-users` — création et gestion des comptes. verify_jwt=true. RÉSERVÉ PRÉSIDENT.
// Garde anti-lockout : aucune action destructrice sur soi-même ; 'president' non assignable via l'UI.
//  - create  { email, password, full_name, role? }  (role par défaut 'chauffeur' : moindre privilège)
//  - invite  { email, full_name, role? }
//  - set_role { user_id, role }   (role ∈ admin/dg/chauffeur/comptable)
//  - set_active { user_id, active } : profil + bannissement Auth (coupe aussi la reconnexion)
//  - delete { user_id } : délie la fiche Équipe, supprime le profil puis le compte
//  - set_password { user_id, password }  (l'admin definit le mot de passe)
//  - send_reset { user_id, redirect_to? } (lien de reinitialisation par e-mail)
//  - create / invite acceptent `team_member_id` : le compte est relié à la fiche Équipe
//    (`team_members.profile_id`), sans quoi un salarié ne voit aucune course (lot S0).
//  - link_member { user_id, team_member_id } : relie un compte existant à une fiche.
//  - get_access { team_member_id } → { ok, access: null | { user_id, email, role, active, last_sign_in_at } }
//  - unlink_member { team_member_id } : délie la fiche de son compte (le compte reste).
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
// Rôle absent ou inconnu → 'chauffeur' (moindre privilège), jamais 'admin'.
const pickRole = (v: unknown) => (typeof v === 'string' && ASSIGNABLE_ROLES.includes(v) ? v : 'chauffeur');
// Désactiver = bannir côté Auth (~100 ans) : plus de connexion ni de
// renouvellement de session. 'none' lève le bannissement.
const BAN_DESACTIVE = '876000h';

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
  // Origine reelle du site, fournie par le front pour `send_reset`.
  const redirectTo = typeof body.redirect_to === 'string' ? body.redirect_to : '';
  const teamMemberId = typeof body.team_member_id === 'string' ? body.team_member_id : '';

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
    .from('profiles').select('company_id, role, active').eq('id', user.id).single();
  if (!me?.company_id) return json({ ok: false, error: 'société introuvable' }, 400);
  if (me.active === false) return json({ ok: false, error: 'compte_desactive' }, 403);
  if (me.role !== 'president') return json({ ok: false, error: 'forbidden_president_only' }, 403);
  const companyId = me.company_id;

  // Fiche Équipe à relier : de la société, et pas déjà reliée à un autre compte.
  async function ficheLiable(): Promise<string | null> {
    if (!teamMemberId) return null;
    const { data: fiche } = await service
      .from('team_members').select('id, company_id, profile_id').eq('id', teamMemberId).maybeSingle();
    if (!fiche || fiche.company_id !== companyId) return 'fiche_introuvable';
    if (fiche.profile_id) return 'fiche_deja_reliee';
    return null;
  }
  // Écriture conditionnelle (`profile_id is null`) : si une autre liaison est
  // passée entre `ficheLiable` et ici, aucune ligne n'est modifiée → refus.
  async function relierFiche(userId: string): Promise<string | null> {
    if (!teamMemberId) return null;
    const { data: lignes, error } = await service
      .from('team_members').update({ profile_id: userId })
      .eq('id', teamMemberId).eq('company_id', companyId).is('profile_id', null)
      .select('id');
    if (error) return error.message;
    if (!lignes || lignes.length === 0) return 'fiche_deja_reliee';
    return null;
  }
  const erreurLien = (lienErr: string) => (lienErr === 'fiche_deja_reliee'
    ? json({ ok: false, error: 'fiche_deja_reliee' }, 400)
    : json({ ok: false, error: 'link_failed', detail: lienErr }, 500));

  // ---- CRÉER ----
  if (action === 'create') {
    if (!email || !password || !fullName) return json({ ok: false, error: 'email, password, full_name requis' }, 400);
    if (password.length < 8) return json({ ok: false, error: 'mot de passe trop court (min 8)' }, 400);
    const role = pickRole(body.role);
    const refusFiche = await ficheLiable();
    if (refusFiche) return json({ ok: false, error: refusFiche }, 400);
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
    const lienErr = await relierFiche(newId);
    if (lienErr) {
      // Pas de compte orphelin (créé mais relié à rien) : on le retire, le
      // profil part avec (profiles.id → auth.users ON DELETE CASCADE).
      await service.auth.admin.deleteUser(newId);
      return erreurLien(lienErr);
    }
    return json({ ok: true, user_id: newId, role, mode: 'created', linked: !!teamMemberId });
  }

  // ---- INVITER ----
  if (action === 'invite') {
    if (!email || !fullName) return json({ ok: false, error: 'email, full_name requis' }, 400);
    const role = pickRole(body.role);
    const refusFiche = await ficheLiable();
    if (refusFiche) return json({ ok: false, error: refusFiche }, 400);
    const { data: invited, error: iErr } = await service.auth.admin.inviteUserByEmail(email);
    if (iErr || !invited?.user) {
      return json({ ok: false, error: 'invite_failed', detail: iErr?.message ?? 'SMTP non configuré ?' }, 400);
    }
    const newId = invited.user.id;
    // Une ré-invitation renvoie un compte qui existait déjà : celui-là, on ne
    // le supprime jamais en cas d'échec (seul un compte né de CET appel l'est).
    const { data: profilExistant } = await service
      .from('profiles').select('id, company_id, role').eq('id', newId).maybeSingle();
    // Jamais « aspirer » le compte d'une autre société ni réécrire un président.
    if (profilExistant && (profilExistant.company_id !== companyId || profilExistant.role === 'president')) {
      return json({ ok: false, error: 'compte_existant_non_modifiable' }, 400);
    }
    const annulerCompte = async () => { if (!profilExistant) await service.auth.admin.deleteUser(newId); };
    const { error: pErr } = await service.from('profiles').upsert({
      id: newId, company_id: companyId, full_name: fullName, role, email, active: true,
    }, { onConflict: 'id' });
    if (pErr) {
      await annulerCompte();
      return json({ ok: false, error: 'profile_failed', detail: pErr.message }, 500);
    }
    const lienErr = await relierFiche(newId);
    if (lienErr) {
      await annulerCompte();
      return erreurLien(lienErr);
    }
    return json({ ok: true, user_id: newId, role, mode: 'invited', linked: !!teamMemberId });
  }

  // ---- RELIER UN COMPTE EXISTANT À UNE FICHE ÉQUIPE ----
  // Avant la garde « pas sur soi-même » : relier SON compte à SA fiche (associé qui
  // conduit) n'a rien de destructeur.
  if (action === 'link_member') {
    if (!targetUserId) return json({ ok: false, error: 'user_id requis' }, 400);
    const { data: cible } = await service
      .from('profiles').select('id, company_id').eq('id', targetUserId).maybeSingle();
    if (!cible || cible.company_id !== companyId) return json({ ok: false, error: 'cible_introuvable' }, 404);
    if (!teamMemberId) return json({ ok: false, error: 'team_member_id requis' }, 400);
    const refusFiche = await ficheLiable();
    if (refusFiche) return json({ ok: false, error: refusFiche }, 400);
    const { data: dejaRelie } = await service
      .from('team_members').select('id').eq('profile_id', targetUserId).limit(1).maybeSingle();
    if (dejaRelie) return json({ ok: false, error: 'compte_deja_relie' }, 400);
    const lienErr = await relierFiche(targetUserId);
    if (lienErr) return erreurLien(lienErr);
    return json({ ok: true, linked: true });
  }

  // ---- ACCÈS AU SITE D'UNE FICHE ÉQUIPE (lecture) ----
  // Lecture seule : permise aussi sur sa propre fiche.
  if (action === 'get_access') {
    if (!teamMemberId) return json({ ok: false, error: 'team_member_id requis' }, 400);
    const { data: fiche } = await service
      .from('team_members').select('id, company_id, profile_id').eq('id', teamMemberId).maybeSingle();
    if (!fiche || fiche.company_id !== companyId) return json({ ok: false, error: 'fiche_introuvable' }, 404);
    if (!fiche.profile_id) return json({ ok: true, access: null });
    const { data: prof } = await service
      .from('profiles').select('id, role, active, email, company_id').eq('id', fiche.profile_id).maybeSingle();
    if (!prof || prof.company_id !== companyId) return json({ ok: true, access: null });
    const { data: authUser } = await service.auth.admin.getUserById(prof.id);
    return json({
      ok: true,
      access: {
        user_id: prof.id,
        email: authUser?.user?.email ?? prof.email ?? null,
        role: prof.role ?? null,
        active: prof.active !== false,
        last_sign_in_at: authUser?.user?.last_sign_in_at ?? null,
      },
    });
  }

  // ---- DÉLIER UNE FICHE ÉQUIPE DE SON COMPTE ----
  // Le compte reste (à désactiver ou supprimer à part) ; il ne voit plus aucune
  // course. Jamais sur sa propre fiche ni sur celle d'un président.
  if (action === 'unlink_member') {
    if (!teamMemberId) return json({ ok: false, error: 'team_member_id requis' }, 400);
    const { data: fiche } = await service
      .from('team_members').select('id, company_id, profile_id').eq('id', teamMemberId).maybeSingle();
    if (!fiche || fiche.company_id !== companyId) return json({ ok: false, error: 'fiche_introuvable' }, 404);
    if (!fiche.profile_id) return json({ ok: true });
    if (fiche.profile_id === user.id) return json({ ok: false, error: 'action_interdite_sur_soi_meme' }, 400);
    const { data: relie } = await service
      .from('profiles').select('role').eq('id', fiche.profile_id).maybeSingle();
    if (relie?.role === 'president') return json({ ok: false, error: 'president_non_modifiable' }, 400);
    const { error } = await service
      .from('team_members').update({ profile_id: null })
      .eq('id', teamMemberId).eq('company_id', companyId);
    if (error) return json({ ok: false, error: 'unlink_failed', detail: error.message }, 500);
    return json({ ok: true });
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
  // `profiles.active` coupe la base (current_company_id) et les Edge
  // (exigerPermission) ; le bannissement Auth coupe la connexion et le
  // renouvellement de session (une session ouverte expire d'elle-même, ≤ 1 h).
  // Un compte relié à une fiche Équipe se coupe comme les autres.
  if (action === 'set_active') {
    if (target.role === 'president') return json({ ok: false, error: 'president_non_modifiable' }, 400);
    const active = body.active === true;
    const { error } = await service.from('profiles').update({ active }).eq('id', targetUserId);
    if (error) return json({ ok: false, error: 'set_active_failed', detail: error.message }, 500);
    const { error: banErr } = await service.auth.admin.updateUserById(targetUserId, {
      ban_duration: active ? 'none' : BAN_DESACTIVE,
    });
    if (banErr) return json({ ok: false, error: 'set_active_failed', detail: banErr.message }, 500);
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
    //
    // `redirectTo` est fourni par le front (origine réelle du site). Sans lui,
    // le lien retombe sur l'URL par défaut du projet Supabase. Il doit figurer
    // dans la liste des URL de redirection autorisées du projet, sinon
    // Supabase l'ignore silencieusement et reprend l'URL par défaut.
    const { error } = await userClient.auth.resetPasswordForEmail(
      cibleEmail,
      typeof redirectTo === 'string' && redirectTo.startsWith('http')
        ? { redirectTo }
        : undefined,
    );
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
    // La fiche Équipe survit au compte : on la délie d'abord (la FK le fera
    // aussi une fois la migration appliquée, on ne s'appuie pas dessus).
    const { error: tmErr } = await service
      .from('team_members').update({ profile_id: null })
      .eq('profile_id', targetUserId).eq('company_id', companyId);
    if (tmErr) return json({ ok: false, error: 'delete_failed', detail: tmErr.message }, 500);
    const { error: pErr } = await service.from('profiles').delete().eq('id', targetUserId);
    if (pErr) return json({ ok: false, error: 'delete_failed', detail: pErr.message }, 500);
    const { error } = await service.auth.admin.deleteUser(targetUserId);
    if (error) return json({ ok: false, error: 'delete_failed', detail: error.message }, 500);
    return json({ ok: true });
  }

  return json({ ok: false, error: 'action_inconnue' }, 400);
});
