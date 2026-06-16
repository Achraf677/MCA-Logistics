import { createContext, useContext } from 'react'
import { CATALOG_BY_SECTION } from './catalog'

export type PermAction = 'view' | 'create' | 'update' | 'delete'

export interface PermEntry {
  view:   boolean
  create: boolean
  update: boolean
  delete: boolean
}

export interface PermissionsCtx {
  ready:          boolean
  isPresident:    boolean
  can:            (key: string, action: PermAction) => boolean
  canViewSection: (section: string) => boolean
}

// Fail-open par défaut : si le contexte est absent (jamais en prod), tout est permis.
export const PermissionsContext = createContext<PermissionsCtx>({
  ready:          true,
  isPresident:    false,
  can:            () => true,
  canViewSection: () => true,
})

export function usePermissions(): PermissionsCtx {
  return useContext(PermissionsContext)
}

/**
 * Construit les fonctions can/canViewSection à partir de la map de permissions.
 * Appelé par PermissionsProvider ; séparé ici pour ne pas mettre de JSX dans un .ts.
 *
 * Règle anti-écran-noir :
 *  - can()            : président→true ; !ready→false ; sinon→map
 *  - canViewSection() : président→true ; !ready→true  ; sinon→au moins 1 ressource visible
 */
export function buildCtx(
  permMap:     Map<string, PermEntry>,
  isPresident: boolean,
  ready:       boolean,
): PermissionsCtx {
  return {
    ready,
    isPresident,

    can(key, action) {
      if (isPresident) return true
      if (!ready)      return false
      return permMap.get(key)?.[action] ?? false
    },

    canViewSection(section) {
      if (isPresident) return true
      if (!ready)      return true   // pendant le chargement : nav complète
      const resources = CATALOG_BY_SECTION[section] ?? []
      return resources.some(r => permMap.get(r.key)?.view ?? false)
    },
  }
}
