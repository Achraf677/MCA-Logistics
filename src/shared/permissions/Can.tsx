import type { ReactNode } from 'react'
import { usePermissions } from './usePermissions'
import type { PermAction } from './usePermissions'

interface Props {
  resource: string
  action: PermAction
  children: ReactNode
}

/** Rend les enfants uniquement si l'utilisateur courant a la permission demandée. */
export function Can({ resource, action, children }: Props) {
  const { can } = usePermissions()
  return can(resource, action) ? <>{children}</> : null
}
