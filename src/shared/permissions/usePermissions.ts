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
  can: (key: string, action: PermAction) => boolean
  canViewSection: (section: string) => boolean
  loading: boolean
}

export const PermissionsContext = createContext<PermissionsCtx>({
  can: () => true,
  canViewSection: () => true,
  loading: true,
})

export function usePermissions(): PermissionsCtx {
  return useContext(PermissionsContext)
}

/** Construit les fonctions can/canViewSection à partir du permMap et du profil. */
export function buildPermFns(
  permMap: Map<string, PermEntry>,
  isPresident: boolean,
  loading: boolean,
): Pick<PermissionsCtx, 'can' | 'canViewSection'> {
  function can(key: string, action: PermAction): boolean {
    if (isPresident) return true
    if (loading) return true
    return permMap.get(key)?.[action] ?? false
  }

  function canViewSection(section: string): boolean {
    if (isPresident) return true
    if (loading) return true
    const resources = CATALOG_BY_SECTION[section] ?? []
    return resources.some(r => (permMap.get(r.key)?.view ?? false))
  }

  return { can, canViewSection }
}
