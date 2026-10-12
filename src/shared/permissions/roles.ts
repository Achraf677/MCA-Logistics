// Rôles des comptes de connexion (`profiles.role`) — PUR, sans DB ni DOM.
//
// Source unique des libellés affichés dans le cadre (Shell), Système ›
// Administrateurs et Équipe › Accès au site.

export type RoleCompte = 'president' | 'admin' | 'dg' | 'chauffeur' | 'comptable'

export const LIBELLES_ROLE: Record<RoleCompte, string> = {
  president: 'Président',
  admin:     'Administrateur',
  dg:        'Directeur général',
  chauffeur: 'Salarié',
  comptable: 'Comptable',
}

/** Libellé lisible d'un rôle ; le code brut s'il est inconnu, « — » s'il manque. */
export function libelleRole(role: string | null | undefined): string {
  if (!role) return '—'
  return LIBELLES_ROLE[role as RoleCompte] ?? role
}

/**
 * Compte « salarié » (rôle technique `chauffeur`) : cloisonné, il ne voit que
 * Mes courses. Le cadre lui retire tout ce qui sert au bureau.
 */
export function estCompteSalarie(role: string | null | undefined): boolean {
  return role === 'chauffeur'
}
