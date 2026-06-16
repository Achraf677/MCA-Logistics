export type AdminRole = 'president' | 'dg' | 'chauffeur' | 'comptable'

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
  dg:        'Directeur général',
  chauffeur: 'Chauffeur',
  comptable: 'Comptable',
}

export const ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
  { value: 'dg',        label: 'Directeur général' },
  { value: 'comptable', label: 'Comptable' },
  { value: 'chauffeur', label: 'Chauffeur' },
]
