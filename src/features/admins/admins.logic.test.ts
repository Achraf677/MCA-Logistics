import { describe, it, expect } from 'vitest'
import { changementRoleSensible, optionsRole } from './admins.logic'
import { ROLE_LABELS, ROLE_OPTIONS } from './admins.types'

describe('rôles depuis Système › Administrateurs', () => {
  it('« Salarié » (chauffeur) n’est plus créable ici', () => {
    expect(ROLE_OPTIONS.map(o => o.value)).not.toContain('chauffeur')
  })
  it('changer le rôle d’un salarié demande confirmation', () => {
    expect(changementRoleSensible('chauffeur', 'dg')).toBe(true)
    expect(changementRoleSensible('dg', 'comptable')).toBe(false)
    expect(changementRoleSensible('chauffeur', 'chauffeur')).toBe(false)
  })
  it('le rôle actuel reste dans la liste', () => {
    expect(optionsRole('chauffeur', ROLE_LABELS)[0]).toEqual({ value: 'chauffeur', label: 'Salarié' })
    expect(optionsRole('dg', ROLE_LABELS)).toBe(ROLE_OPTIONS)
  })
})
