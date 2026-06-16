import type { ReactNode } from 'react'
import { usePermissions } from './usePermissions'
import type { PermAction } from './usePermissions'

interface Props {
  resource: string
  action:   PermAction
  children: ReactNode
}

/** Affiche ses enfants uniquement si l'utilisateur a la permission demandée. */
export function Can({ resource, action, children }: Props) {
  const { can } = usePermissions()
  return can(resource, action) ? <>{children}</> : null
}
