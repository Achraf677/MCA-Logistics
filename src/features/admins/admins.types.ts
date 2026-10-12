import { LIBELLES_ROLE } from '../../shared/permissions/roles'
import type { RoleCompte } from '../../shared/permissions/roles'

export type AdminRole = RoleCompte

export interface AdminMember {
  id: string
  full_name: string
  role: AdminRole
  email: string | null
  active?: boolean
}

export interface ResourcePermission {
  resource: string
  voir: boolean
  creer: boolean
  modifier: boolean
  supprimer: boolean
}

export const ROLE_LABELS: Record<AdminRole, string> = LIBELLES_ROLE

/**
 * Rôles créables / attribuables depuis Système › Administrateurs. Pas de
 * « Salarié » (rôle `chauffeur`) : un salarié se crée depuis sa fiche
 * Équipe › Accès au site, qui relie le compte à la fiche (sans lien, il ne
 * verrait aucune course).
 */
export const ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
  { value: 'admin',     label: 'Administrateur' },
  { value: 'dg',        label: 'Directeur général' },
  { value: 'comptable', label: 'Comptable' },
]
