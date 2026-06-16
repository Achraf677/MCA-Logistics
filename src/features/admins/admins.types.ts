export type AdminRole = 'president' | 'admin' | 'dg' | 'chauffeur' | 'comptable'

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

export const ROLE_LABELS: Record<AdminRole, string> = {
  president: 'Président',
  admin:     'Administrateur',
  dg:        'Directeur général',
  chauffeur: 'Chauffeur',
  comptable: 'Comptable',
}

export const ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
  { value: 'admin',     label: 'Administrateur' },
  { value: 'dg',        label: 'Directeur général' },
  { value: 'comptable', label: 'Comptable' },
  { value: 'chauffeur', label: 'Chauffeur' },
]
