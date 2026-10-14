import { estCompteSalarie } from '../../shared/permissions/roles'
import { ROLE_OPTIONS } from './admins.types'
import type { AdminRole } from './admins.types'

/**
 * Changer le rôle d'un compte salarié le sort de son cloisonnement (il verrait
 * le menu du bureau selon ses droits) : confirmation explicite obligatoire.
 */
export function changementRoleSensible(avant: AdminRole, apres: AdminRole): boolean {
  return avant !== apres && estCompteSalarie(avant)
}

/** Options du sélecteur de rôle : le rôle actuel reste affiché même s'il n'est plus attribuable. */
export function optionsRole(actuel: AdminRole, libelles: Record<AdminRole, string>): { value: AdminRole; label: string }[] {
  if (ROLE_OPTIONS.some(o => o.value === actuel)) return ROLE_OPTIONS
  return [{ value: actuel, label: libelles[actuel] ?? actuel }, ...ROLE_OPTIONS]
}
