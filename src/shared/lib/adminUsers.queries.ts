import { supabase } from '../../app/providers'
import type { AccesCompte, ReponseAdmin } from './adminUsers'

/**
 * Appel de l'Edge admin-users (réservée au président). En cas de 4xx / 5xx,
 * `functions.invoke` renvoie `data = null` : le corps `{ ok:false, error }`
 * n'est lisible que dans `error.context` — on le lit, sinon l'écran n'afficherait
 * que « non-2xx ».
 */
async function appelEdge<T extends object>(nom: string, body: Record<string, unknown>): Promise<ReponseAdmin & Partial<T>> {
  const { data, error } = await supabase.functions.invoke(nom, { body })
  if (data) return data as ReponseAdmin & Partial<T>
  const ctx = (error as { context?: Response } | null)?.context
  if (ctx && typeof ctx.json === 'function') {
    try { return await ctx.json() as ReponseAdmin & Partial<T> } catch { /* corps illisible */ }
  }
  return { ok: false, error: error?.message ?? 'appel impossible' } as ReponseAdmin & Partial<T>
}

export function appelAdmin<T extends object = object>(body: Record<string, unknown>) {
  return appelEdge<T>('admin-users', body)
}

/** Edge admin-permissions (droits par ressource), même lecture d'erreur. */
export function appelPermissions<T extends object = object>(body: Record<string, unknown>) {
  return appelEdge<T>('admin-permissions', body)
}

/** Crée un compte (mot de passe donné ou invitation) ; relie la fiche Équipe si fournie. */
export function creerCompte(p: {
  mode: 'mot_de_passe' | 'invitation'
  email: string; fullName: string; role: string
  motDePasse?: string; teamMemberId?: string
}) {
  return appelAdmin({
    action: p.mode === 'mot_de_passe' ? 'create' : 'invite',
    email: p.email.trim(), full_name: p.fullName.trim(),
    ...(p.mode === 'mot_de_passe' ? { password: p.motDePasse } : {}),
    role: p.role,
    ...(p.teamMemberId ? { team_member_id: p.teamMemberId } : {}),
  })
}

export function relierFiche(userId: string, teamMemberId: string) {
  return appelAdmin({ action: 'link_member', user_id: userId, team_member_id: teamMemberId })
}

export function delierFiche(teamMemberId: string) {
  return appelAdmin({ action: 'unlink_member', team_member_id: teamMemberId })
}

export function lireAcces(teamMemberId: string) {
  return appelAdmin<{ access: AccesCompte | null }>({ action: 'get_access', team_member_id: teamMemberId })
}

/** Coupe (false) ou rétablit (true) vraiment la connexion du compte. */
export function changerActif(userId: string, active: boolean) {
  return appelAdmin({ action: 'set_active', user_id: userId, active })
}

export function definirMotDePasse(userId: string, password: string) {
  return appelAdmin({ action: 'set_password', user_id: userId, password })
}

/** Lien de réinitialisation par e-mail, qui ramène sur CE site. */
export function envoyerLienReinit(userId: string) {
  return appelAdmin<{ email: string }>({
    action: 'send_reset', user_id: userId, redirect_to: `${window.location.origin}/auth/callback`,
  })
}

export function changerRole(userId: string, role: string) {
  return appelAdmin({ action: 'set_role', user_id: userId, role })
}

export function supprimerCompte(userId: string) {
  return appelAdmin({ action: 'delete', user_id: userId })
}
